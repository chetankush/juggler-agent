/**
 * Discord bot.
 *
 * Connects only when DISCORD_BOT_TOKEN is set (graceful degradation).
 * Does NOT request privileged intents (MessageContent) so it works out of the
 * box without the user toggling anything in the Developer Portal.
 *
 * Capture surfaces (in order of reliability):
 *   1. `/task <description>` slash command — works without privileged intents.
 *   2. `/link` slash command — binds the current guild to the invoker's workspace.
 *   3. `/standup` slash command — prints today's standup right in chat.
 *   4. messageCreate @mention — works only if MESSAGE CONTENT INTENT is on.
 *
 * Exports `postStandupToWorkspace(workspaceId)` for the EOD scheduler.
 */
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  type Message,
  type ChatInputCommandInteraction,
  type TextChannel,
  type Guild,
} from "discord.js";
import { eq } from "drizzle-orm";
import { env } from "../lib/env.js";
import { extractTask } from "../services/extraction.js";
import { generateStandup } from "../services/summary.js";
import { db } from "../db/client.js";
import { tasks, workspaces, users } from "../db/schema.js";

export let discordClient: Client | null = null;

// ── Slash command definitions ────────────────────────────────────────────────
const COMMANDS = [
  new SlashCommandBuilder()
    .setName("task")
    .setDescription("Capture a task with AI (no privileged intents needed)")
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("Describe what needs to be done")
        .setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link this Discord server to your AI Sync Copilot workspace")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("standup")
    .setDescription("Show today's standup for this workspace")
    .toJSON(),
];

async function registerCommandsForGuild(token: string, clientId: string, guildId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: COMMANDS });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function findFirstPostableChannel(guild: Guild): Promise<TextChannel | null> {
  let channel: TextChannel | null = (guild.systemChannel as TextChannel | null) ?? null;
  if (channel) return channel;
  const all = await guild.channels.fetch();
  channel = [...all.values()].find(
    (c): c is TextChannel => !!c && c.type === ChannelType.GuildText,
  ) ?? null;
  return channel;
}

/** Post the workspace's standup to its linked Discord guild. Throws on failure. */
export async function postStandupToWorkspace(workspaceId: string): Promise<void> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) throw new Error("Workspace not found");
  if (!ws.discordGuildId) throw new Error("Workspace not linked to Discord");
  if (!discordClient?.isReady?.()) throw new Error("Discord bot not running");

  const guild = await discordClient.guilds.fetch(ws.discordGuildId);
  const channel = await findFirstPostableChannel(guild);
  if (!channel) throw new Error("No postable text channel");

  const summary = await generateStandup(workspaceId);
  await channel.send("```\n" + summary.text + "\n```");
}

// ── Slash command handlers ───────────────────────────────────────────────────
async function handleTaskCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: false });
  const description = interaction.options.getString("description", true);
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("❌ `/task` only works inside a server.");
    return;
  }

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.discordGuildId, guildId))
    .limit(1);
  if (!ws) {
    await interaction.editReply(
      "❌ This server isn't linked to a workspace yet. Run `/link` (you must own a workspace in the web app first).",
    );
    return;
  }

  try {
    const extraction = await extractTask(description);

    // Assign to the invoking user if their Discord identity is linked.
    let assignedUserId: string | null = null;
    const [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.discordId, interaction.user.id))
      .limit(1);
    if (appUser) assignedUserId = appUser.id;

    await db.insert(tasks).values({
      workspaceId: ws.id,
      assignedUserId,
      title: extraction.title,
      description: extraction.summary,
      priority: extraction.priority,
      deadline: extraction.deadline ?? null,
      status: "active",
      sourceMessage: `/task ${description}`,
    });

    await interaction.editReply(
      `✅ Captured: **${extraction.title}** (${extraction.priority}` +
        (extraction.deadline ? `, due ${extraction.deadline}` : "") +
        `)${assignedUserId ? "" : "\n_(Link your Discord ID in Settings to auto-assign tasks to you.)_"}`,
    );
  } catch (err) {
    await interaction.editReply(`❌ Failed: ${(err as Error).message}`);
  }
}

async function handleLinkCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("❌ `/link` only works inside a server.");
    return;
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1);
  if (!appUser) {
    await interaction.editReply(
      "❌ Your Discord identity isn't linked yet. Open the web app → Settings → Discord identity and paste your Discord user ID, then run `/link` again.",
    );
    return;
  }

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, appUser.id))
    .limit(1);
  if (!ws) {
    await interaction.editReply(
      "❌ You don't own a workspace yet. Create one in the web app, then run `/link` again.",
    );
    return;
  }

  await db
    .update(workspaces)
    .set({
      discordGuildId: guildId,
      discordGuildName: interaction.guild?.name ?? null,
      discordChannelName:
        interaction.channel && "name" in interaction.channel
          ? ((interaction.channel as { name: string | null }).name ?? null)
          : null,
    })
    .where(eq(workspaces.id, ws.id));

  await interaction.editReply(
    `✅ Linked **${interaction.guild?.name}** to workspace **${ws.name}**. Now use \`/task\` here to capture work.`,
  );
}

async function handleStandupCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("❌ `/standup` only works inside a server.");
    return;
  }
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.discordGuildId, guildId))
    .limit(1);
  if (!ws) {
    await interaction.editReply("❌ This server isn't linked to a workspace. Run `/link` first.");
    return;
  }
  const summary = await generateStandup(ws.id);
  await interaction.editReply("```\n" + summary.text + "\n```");
}

// ── messageCreate (works if MESSAGE CONTENT INTENT is enabled; otherwise quiet) ──
async function handleMentionMessage(client: Client, message: Message) {
  if (message.author.bot) return;
  if (!client.user || !message.mentions.has(client.user)) return;

  const rawText = message.content.replace(/<@!?\d+>/g, "").trim();
  if (!rawText) return; // Discord won't deliver content without the intent → safely ignored.

  try {
    const extraction = await extractTask(rawText);
    const guildId = message.guildId ?? "dm";
    const [ws] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.discordGuildId, guildId))
      .limit(1);
    if (!ws) {
      await message.react("❓").catch(() => void 0);
      return;
    }

    let assignedUserId: string | null = null;
    const target = message.mentions.users
      .filter((u) => u.id !== client.user!.id)
      .first();
    if (target) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.discordId, target.id))
        .limit(1);
      if (u) assignedUserId = u.id;
    }

    await db.insert(tasks).values({
      workspaceId: ws.id,
      assignedUserId,
      title: extraction.title,
      description: extraction.summary,
      priority: extraction.priority,
      deadline: extraction.deadline ?? null,
      status: "active",
      sourceMessage: message.content,
    });
    await message.react("✅");
  } catch (err) {
    console.error("[discord] mention-capture failed:", (err as Error).message);
    await message.react("❌").catch(() => void 0);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
export async function startDiscordBot(): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN) {
    console.warn("Discord bot not started: DISCORD_BOT_TOKEN is not set.");
    return;
  }
  if (!env.DISCORD_CLIENT_ID) {
    console.warn(
      "Discord bot not started: DISCORD_CLIENT_ID is not set (required to register slash commands).",
    );
    return;
  }

  const client = new Client({
    // No privileged intents — slash commands work without them.
    // MessageContent / GuildMembers would require enabling in the Dev Portal.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`Discord bot ready as ${c.user.tag}`);
    // Register slash commands for every guild we're already in.
    for (const guild of c.guilds.cache.values()) {
      try {
        await registerCommandsForGuild(env.DISCORD_BOT_TOKEN!, env.DISCORD_CLIENT_ID!, guild.id);
      } catch (err) {
        console.warn(`[discord] register commands for ${guild.name}:`, (err as Error).message);
      }
    }
  });

  // Register commands when invited to a new guild.
  client.on(Events.GuildCreate, async (guild) => {
    try {
      await registerCommandsForGuild(env.DISCORD_BOT_TOKEN!, env.DISCORD_CLIENT_ID!, guild.id);
      console.log(`[discord] registered /task /link /standup in ${guild.name}`);
    } catch (err) {
      console.warn(`[discord] guildCreate register failed:`, (err as Error).message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      if (interaction.commandName === "task") return await handleTaskCommand(interaction);
      if (interaction.commandName === "link") return await handleLinkCommand(interaction);
      if (interaction.commandName === "standup") return await handleStandupCommand(interaction);
    } catch (err) {
      console.error("[discord] interaction error:", (err as Error).message);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(`❌ ${(err as Error).message}`).catch(() => void 0);
      }
    }
  });

  client.on(Events.MessageCreate, (m) => {
    void handleMentionMessage(client, m);
  });

  client.on("error", (err) => {
    console.error("[discord] client error:", err.message);
  });

  try {
    await client.login(env.DISCORD_BOT_TOKEN);
    discordClient = client;
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`⚠️  Discord bot not started: ${msg}`);
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
    discordClient = null;
  }
}
