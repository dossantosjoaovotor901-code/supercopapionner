import "dotenv/config";
import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN || "";
const guildId = process.env.DISCORD_GUILD_ID || "";
const apiUrl = process.env.BOT_API_URL || "http://localhost:3000/api/bot/snapshot";
const apiToken = process.env.BOT_API_TOKEN || "";
const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const pollMs = Math.max(10_000, Number(process.env.BOT_POLL_MS || 15_000));
const adminIds = new Set(
  [process.env.DISCORD_ADMIN_ID || "", ...(process.env.DISCORD_ADMIN_IDS || "").split(",")]
    .map(value => value.trim())
    .filter(Boolean)
);
const channels = {
  public: process.env.DISCORD_PUBLIC_CHANNEL_ID || "",
  payment: process.env.DISCORD_PAYMENT_CHANNEL_ID || "",
  admin: process.env.DISCORD_ADMIN_CHANNEL_ID || "",
};

if (!token) {
  console.error("DISCORD_BOT_TOKEN não configurado. O bot não foi iniciado.");
  process.exit(1);
}
if (!apiToken) {
  console.error("BOT_API_TOKEN não configurado. O bot não foi iniciado.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
let previousSnapshot = null;

const statusLabels = {
  received: "Recebida",
  awaiting_payment: "Aguardando pagamento",
  proof_submitted: "Comprovante enviado",
  under_review: "Em análise",
  confirmed: "Confirmada",
  rejected: "Recusada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

const commands = [
  new SlashCommandBuilder().setName("ajuda").setDescription("Mostra tudo que o bot da Super Copa Pionner faz"),
  new SlashCommandBuilder().setName("competicao").setDescription("Mostra informações da competição atual"),
  new SlashCommandBuilder().setName("inscricao").setDescription("Abre o formulário de inscrição da sua equipe"),
  new SlashCommandBuilder().setName("status").setDescription("Consulta uma inscrição pelo código SCP").addStringOption(option => option.setName("codigo").setDescription("Ex.: SCP-00001").setRequired(true)),
  new SlashCommandBuilder().setName("partidas").setDescription("Lista os próximos jogos e partidas ao vivo"),
  new SlashCommandBuilder().setName("classificacao").setDescription("Mostra a classificação dos grupos"),
  new SlashCommandBuilder().setName("painel").setDescription("Abre o painel público da Super Copa Pionner"),
  new SlashCommandBuilder().setName("anunciar").setDescription("Publica um comunicado no canal público (admin)").addStringOption(option => option.setName("mensagem").setDescription("Texto do comunicado").setRequired(true)),
].map(command => command.toJSON());

function dateLabel(value) {
  const parsed = new Date(value?.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? "A definir" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: value?.length > 10 ? "short" : undefined }).format(parsed);
}
function money(value = 0) {
  return value ? Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Grátis";
}
function site(path = "") {
  return `${siteUrl}${path}`;
}
async function snapshot() {
  const response = await fetch(apiUrl, { headers: { "x-bot-token": apiToken } });
  if (!response.ok) throw new Error(`API do campeonato respondeu ${response.status}`);
  return response.json();
}
async function sendTo(channelId, payload) {
  if (!channelId) return false;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return false;
    await channel.send(payload);
    return true;
  } catch (error) {
    console.error(`Falha ao enviar para o canal ${channelId}:`, error.message);
    return false;
  }
}
async function directMessage(userId, payload) {
  if (!userId) return false;
  try {
    const user = await client.users.fetch(userId);
    await user.send(payload);
    return true;
  } catch (error) {
    console.warn(`Não foi possível enviar DM para ${userId}:`, error.message);
    return false;
  }
}
function discordIdForRegistration(registration) {
  const candidates = [registration.captainUserId, registration.captainDiscord];
  return candidates.find(value => /^\d{15,22}$/.test(String(value || ""))) || "";
}
function registrationEmbed(registration, title = "Atualização da inscrição") {
  return new EmbedBuilder()
    .setColor(registration.status === "confirmed" ? 0x16a34a : registration.status === "rejected" ? 0xdc4054 : 0x1459e6)
    .setTitle(title)
    .setDescription(`**${registration.teamName}** · código **${registration.code}**`)
    .addFields(
      { name: "Status", value: statusLabels[registration.status] || registration.status, inline: true },
      { name: "Capitão", value: registration.captainName || "Não informado", inline: true },
      { name: "Elenco", value: `${registration.players?.length || 0} jogador(es)`, inline: true },
      { name: "Acessar no site", value: `[Acompanhar inscrição](${site("/inscricoes")})` },
    )
    .setTimestamp(new Date(registration.updatedAt || registration.createdAt || Date.now()));
}
function isAdmin(interaction) {
  return adminIds.has(interaction.user.id) || Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}
function standings(state) {
  const groupPhaseIds = new Set((state.phases || []).filter(phase => phase.kind === "group").map(phase => phase.id));
  const rows = new Map((state.teams || []).map(team => [team.id, { team, p: 0, j: 0, v: 0, e: 0, d: 0, sg: 0 }]));
  for (const match of state.matches || []) {
    if (match.status !== "finished" || !groupPhaseIds.has(match.phaseId) || !match.homeId || !match.awayId) continue;
    const home = rows.get(match.homeId); const away = rows.get(match.awayId);
    if (!home || !away) continue;
    home.j++; away.j++; home.sg += match.homeScore - match.awayScore; away.sg += match.awayScore - match.homeScore;
    if (match.homeScore > match.awayScore) { home.p += 3; home.v++; away.d++; }
    else if (match.homeScore < match.awayScore) { away.p += 3; away.v++; home.d++; }
    else { home.p++; away.p++; home.e++; away.e++; }
  }
  return [...rows.values()].sort((a, b) => b.p - a.p || b.sg - a.sg || b.v - a.v || a.team.name.localeCompare(b.team.name, "pt-BR"));
}
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    console.log(`Comandos slash registrados no servidor ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("Comandos slash registrados globalmente; a propagação pode levar alguns minutos.");
  }
}
async function pollNotifications() {
  try {
    const current = await snapshot();
    if (!previousSnapshot) { previousSnapshot = current; return; }
    const oldState = previousSnapshot.state; const state = current.state;
    const oldRegs = new Map((oldState.registrations || []).map(item => [item.id, item]));
    for (const registration of state.registrations || []) {
      const before = oldRegs.get(registration.id);
      if (!before) {
        await sendTo(channels.admin, { embeds: [registrationEmbed(registration, "Nova inscrição recebida")] });
        await directMessage(discordIdForRegistration(registration), { embeds: [registrationEmbed(registration, "Sua inscrição foi recebida")] });
      } else if (before.status !== registration.status) {
        const target = registration.status === "proof_submitted" || registration.status === "under_review" ? channels.payment : channels.admin;
        await sendTo(target, { embeds: [registrationEmbed(registration, `Inscrição ${statusLabels[registration.status] || registration.status}`)] });
        await directMessage(discordIdForRegistration(registration), { embeds: [registrationEmbed(registration, "Atualização da sua inscrição")] });
      }
    }
    const oldMatches = new Map((oldState.matches || []).map(item => [item.id, item]));
    for (const match of state.matches || []) {
      const before = oldMatches.get(match.id);
      if (!before || before.status === match.status || !["live", "finished"].includes(match.status)) continue;
      const team = id => (state.teams || []).find(item => item.id === id)?.name || "A definir";
      const embed = new EmbedBuilder().setColor(match.status === "live" ? 0xdc4054 : 0x1459e6).setTitle(match.status === "live" ? "Partida ao vivo" : "Partida encerrada").setDescription(`**${team(match.homeId)}** ${match.homeScore} × ${match.awayScore} **${team(match.awayId)}**`).addFields({ name: "Data", value: dateLabel(match.scheduledAt), inline: true }, { name: "Acompanhe", value: `[Abrir agenda](${site("/partidas")})`, inline: true });
      await sendTo(channels.public, { embeds: [embed] });
    }
    previousSnapshot = current;
  } catch (error) {
    console.error("Falha na sincronização do bot:", error.message);
  }
}

client.once("ready", async ready => {
  console.log(`Bot conectado como ${ready.user.tag}.`);
  await registerCommands();
  await pollNotifications();
  setInterval(() => void pollNotifications(), pollMs);
  if (!channels.admin) console.warn("DISCORD_ADMIN_CHANNEL_ID não configurado; alertas de operação ficarão apenas no log.");
  if (!channels.payment) console.warn("DISCORD_PAYMENT_CHANNEL_ID não configurado; alertas de comprovante não serão publicados.");
  if (!channels.public) console.warn("DISCORD_PUBLIC_CHANNEL_ID não configurado; alertas de partidas não serão publicados.");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    const data = await snapshot(); const state = data.state;
    if (interaction.commandName === "ajuda") {
      await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor(0x1459e6).setTitle("Super Copa Pionner · Central Discord").setDescription("Use o Discord para acompanhar a competição sem sair do servidor.").addFields({ name: "Comandos públicos", value: "`/competicao` informações e prazos\n`/inscricao` abrir formulário\n`/status` consultar código SCP\n`/partidas` próximos jogos\n`/classificacao` tabela dos grupos\n`/painel` abrir o site" }, { name: "Operação", value: "Administradores podem usar `/anunciar`. O bot também notifica automaticamente novas inscrições, comprovantes, aprovações, partidas ao vivo e resultados." })] });
      return;
    }
    if (interaction.commandName === "painel" || interaction.commandName === "inscricao") {
      await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor(0x1459e6).setTitle(interaction.commandName === "inscricao" ? "Inscreva sua equipe" : "Painel da competição").setDescription(`[Abrir ${interaction.commandName === "inscricao" ? "formulário de inscrição" : "site da Super Copa Pionner"}](${site(interaction.commandName === "inscricao" ? "/inscricoes/nova" : "/")})`)] });
      return;
    }
    if (interaction.commandName === "competicao") {
      const config = state.config;
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1459e6).setTitle(config.name).setDescription(config.subtitle || "Competição oficial da comunidade HaxBall.").addFields({ name: "Formato", value: `${config.competitionType === "league" ? "Liga" : "Copa"} · ${config.modality || "X5"}`, inline: true }, { name: "Inscrição", value: money(config.entryFee), inline: true }, { name: "Premiação", value: config.prize || "A definir", inline: true }, { name: "Inscrições até", value: dateLabel(config.registrationDeadline), inline: true }, { name: "Pagamento até", value: dateLabel(config.paymentDeadline), inline: true }, { name: "Vagas", value: `${(state.registrations || []).filter(item => !["cancelled", "expired", "rejected"].includes(item.status)).length}/${config.maxTeams || "—"}`, inline: true }).setFooter({ text: `Mais detalhes: ${site("/campeonatos")}` })] });
      return;
    }
    if (interaction.commandName === "status") {
      const code = interaction.options.getString("codigo", true).toUpperCase();
      const registration = (state.registrations || []).find(item => item.code.toUpperCase() === code);
      if (!registration) { await interaction.reply({ ephemeral: true, content: `Não encontrei a inscrição **${code}**.` }); return; }
      await interaction.reply({ ephemeral: true, embeds: [registrationEmbed(registration, "Consulta de inscrição")] });
      return;
    }
    if (interaction.commandName === "partidas") {
      const team = id => (state.teams || []).find(item => item.id === id)?.shortName || "A definir";
      const matches = [...(state.matches || [])].filter(match => ["scheduled", "live"].includes(match.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 8);
      const description = matches.length ? matches.map(match => `${match.status === "live" ? "🔴 AO VIVO" : "🗓️"} **${team(match.homeId)} × ${team(match.awayId)}** · ${dateLabel(match.scheduledAt)}`).join("\n") : "Nenhuma partida próxima cadastrada.";
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1459e6).setTitle("Próximas partidas").setDescription(description).setFooter({ text: `Agenda completa: ${site("/partidas")}` })] });
      return;
    }
    if (interaction.commandName === "classificacao") {
      const rows = standings(state).slice(0, 12);
      const description = rows.length ? rows.map((row, index) => `**${index + 1}.** ${row.team.name} · **${row.p} pts** · ${row.j}J · SG ${row.sg >= 0 ? "+" : ""}${row.sg}`).join("\n") : "Ainda não há classificação disponível.";
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1459e6).setTitle("Classificação geral").setDescription(description).setFooter({ text: `Tabela completa: ${site("/classificacao")}` })] });
      return;
    }
    if (interaction.commandName === "anunciar") {
      if (!isAdmin(interaction)) { await interaction.reply({ ephemeral: true, content: "Você não tem permissão para publicar comunicados." }); return; }
      const message = interaction.options.getString("mensagem", true);
      const sent = await sendTo(channels.public, { embeds: [new EmbedBuilder().setColor(0x1459e6).setTitle("Comunicado da organização").setDescription(message).setFooter({ text: "Super Copa Pionner" })] });
      await interaction.reply({ ephemeral: true, content: sent ? "Comunicado publicado no canal público." : "Não consegui publicar: DISCORD_PUBLIC_CHANNEL_ID não está configurado ou o bot não tem permissão." });
    }
  } catch (error) {
    console.error("Erro no comando:", error);
    if (interaction.replied || interaction.deferred) await interaction.followUp({ ephemeral: true, content: "Não consegui consultar a competição agora. Tente novamente em instantes." }).catch(() => {});
    else await interaction.reply({ ephemeral: true, content: "Não consegui consultar a competição agora. Tente novamente em instantes." }).catch(() => {});
  }
});

client.login(token);
