const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType, PermissionFlagsBits, AttachmentBuilder, RoleSelectMenuBuilder 
} = require('discord.js');
const fs = require('fs');
const express = require('express');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// --- Servidor Web para manter ativo na Discloud ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot de 1v1 a funcionar perfeitamente!'));
app.listen(PORT, () => console.log(`Servidor web na porta ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1551768205444259862";

// --- Mapeamento de Cores ---
const COLOR_MAP = {
    'lavanda': '#9b59b6',
    'azul': '#3498db',
    'dourado': '#f1c40f',
    'verde': '#2ecc71',
    'cinza': '#34495e',
    'branco': '#ecf0f1',
    'rosa': '#e91e63',
    'amarelo': '#f39c12',
    'ciano': '#00bcd4'
};

// --- Base de dados local ---
const DB_FILE = './database.json';
function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ 
            players: {}, 
            settings: { 
                ligaNome: '', 
                ligaCor: 'dourado',
                cargoProcurando: null,
                cargoTop1: null,
                cargoTop2: null,
                cargoTop3: null
            } 
        }, null, 2));
    }
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!data.settings) {
            data.settings = { 
                ligaNome: '', 
                ligaCor: 'dourado',
                cargoProcurando: null,
                cargoTop1: null,
                cargoTop2: null,
                cargoTop3: null
            };
        }
        return data;
    } catch {
        return { 
            players: {}, 
            settings: { 
                ligaNome: '', 
                ligaCor: 'dourado',
                cargoProcurando: null,
                cargoTop1: null,
                cargoTop2: null,
                cargoTop3: null
            } 
        };
    }
}
function saveDB(data) {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DB_FILE);
}

// ============================================================
// --- FUNÇÃO PARA ATUALIZAR CARGOS DO PÓDIO AUTOMATICAMENTE ---
// ============================================================
async function atualizarCargosPodio(guild, db) {
    if (!guild) return;
    const settings = db.settings;
    const sortedPlayers = Object.values(db.players)
        .filter(p => p.points > 0)
        .sort((a, b) => b.points - a.points);

    const top1Id = sortedPlayers[0]?.userId || null;
    const top2Id = sortedPlayers[1]?.userId || null;
    const top3Id = sortedPlayers[2]?.userId || null;

    const pods = [
        { roleId: settings.cargoTop1, targetUserId: top1Id },
        { roleId: settings.cargoTop2, targetUserId: top2Id },
        { roleId: settings.cargoTop3, targetUserId: top3Id }
    ];

    for (const pod of pods) {
        if (!pod.roleId) continue;
        const role = await guild.roles.fetch(pod.roleId).catch(() => null);
        if (!role) continue;

        for (const member of role.members.values()) {
            if (member.id !== pod.targetUserId) {
                await member.roles.remove(role).catch(() => {});
            }
        }

        if (pod.targetUserId) {
            const member = await guild.members.fetch(pod.targetUserId).catch(() => null);
            if (member && !member.roles.cache.has(role.id)) {
                await member.roles.add(role).catch(() => {});
            }
        }
    }
}

// ============================================================
// --- FUNÇÕES AUXILIARES DE CANVAS ---
// ============================================================
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function drawRoundImage(ctx, img, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
}

// ============================================================
// --- GERADOR DE IMAGEM: ANÁLISE DE PERFIL ---
// ============================================================
async function generateAnaliseImage(member, stats, rankPosition, dbSettings = {}) {
    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext('2d');
    const selectedColor = COLOR_MAP[dbSettings.ligaCor] || '#e74c3c';

    ctx.fillStyle = selectedColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'rgba(15, 15, 18, 0.82)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 2;
    roundRect(ctx, 480, 30, 280, 50, 10, false, true);
    ctx.fillStyle = '#888888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LIGA ATUAL', 620, 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText((dbSettings.ligaNome || '').toUpperCase(), 620, 68);

    let avatarImg = null;
    try {
        const avatarURL = member.displayAvatarURL ? member.displayAvatarURL({ extension: 'png', size: 256 }) : `https://cdn.discordapp.com/embed/avatars/0.png`;
        avatarImg = await loadImage(avatarURL);
    } catch {}

    if (avatarImg) {
        drawRoundImage(ctx, avatarImg, 75, 125, 150);
    } else {
        ctx.fillStyle = '#2c2d30';
        ctx.beginPath();
        ctx.arc(150, 200, 75, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    const username = member.displayName || member.username || 'Jogador';
    ctx.fillText(username.slice(0, 20), 270, 170);

    ctx.fillStyle = selectedColor;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`RANK #${rankPosition} • ${stats.points} PTS`, 270, 210);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '11px sans-serif';
    ctx.fillText('TAXA DE VITÓRIA', 270, 260);
    ctx.textAlign = 'right';

    const totalJogos = (stats.wins || 0) + (stats.losses || 0) + (stats.draws || 0);
    const winRate = totalJogos > 0 ? ((stats.wins / totalJogos) * 100).toFixed(1) : '0.0';
    ctx.fillText(`${winRate}%`, 760, 260);

    ctx.fillStyle = '#2c2d30';
    roundRect(ctx, 270, 275, 490, 8, 4, true, false);
    
    ctx.fillStyle = selectedColor;
    const barraWidth = Math.max(10, (490 * parseFloat(winRate)) / 100);
    roundRect(ctx, 270, 275, barraWidth, 8, 4, true, false);

    const boxWidth = 153;
    const boxHeight = 100;
    const boxY = 310;

    // Vitórias
    ctx.fillStyle = 'rgba(30, 31, 34, 0.9)';
    roundRect(ctx, 270, boxY, boxWidth, boxHeight, 12, true, false);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(270, boxY, 4, boxHeight);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VITÓRIAS', 290, boxY + 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(stats.wins || 0, 290, boxY + 75);

    // Empates
    ctx.fillStyle = 'rgba(30, 31, 34, 0.9)';
    roundRect(ctx, 438, boxY, boxWidth, boxHeight, 12, true, false);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(438, boxY, 4, boxHeight);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('EMPATES', 458, boxY + 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(stats.draws || 0, 458, boxY + 75);

    // Derrotas
    ctx.fillStyle = 'rgba(30, 31, 34, 0.9)';
    roundRect(ctx, 606, boxY, boxWidth, boxHeight, 12, true, false);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(606, boxY, 4, boxHeight);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('DERROTAS', 626, boxY + 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(stats.losses || 0, 626, boxY + 75);

    return canvas.toBuffer('image/png');
}

// ============================================================
// --- GERADOR DE IMAGEM: TABELA DE RANKING ---
// ============================================================
const ROW_H = 75, W = 800, HEADER_H = 130;

async function generateRankingImage(playersArray, page = 0, dbSettings = {}) {
    const PER_PAGE = 4;
    const startIdx = page * PER_PAGE;
    const current = playersArray.slice(startIdx, startIdx + PER_PAGE);
    const H = HEADER_H + Math.max(current.length, 1) * ROW_H + 60;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const selectedColor = COLOR_MAP[dbSettings.ligaCor] || '#e74c3c';

    ctx.fillStyle = selectedColor;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(15, 15, 18, 0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TABELA 1V1', W / 2, 45);

    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 250, 60, 300, 35, 8, false, true);
    ctx.fillStyle = '#888888';
    ctx.font = '9px sans-serif';
    ctx.fillText('LIGA ATUAL', W / 2, 75);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText((dbSettings.ligaNome || '').toUpperCase(), W / 2, 88);

    if (current.length === 0) {
        ctx.fillStyle = '#888888';
        ctx.font = '20px sans-serif';
        ctx.fillText('Nenhum jogador pontuado.', W / 2, HEADER_H + 50);
        return canvas.toBuffer('image/png');
    }

    let startY = 120;
    for (let i = 0; i < current.length; i++) {
        const p = current[i];
        const rank = startIdx + i + 1;

        ctx.fillStyle = 'rgba(30, 31, 34, 0.85)';
        roundRect(ctx, 50, startY, 700, 60, 10, true, false);

        if (rank === 1) ctx.fillStyle = '#f1c40f';
        else if (rank === 2) ctx.fillStyle = '#95a5a6';
        else if (rank === 3) ctx.fillStyle = '#d35400';
        else ctx.fillStyle = selectedColor;
        ctx.fillRect(50, startY, 5, 60);

        ctx.fillStyle = rank === 1 ? '#f1c40f' : rank === 2 ? '#95a5a6' : rank === 3 ? '#d35400' : '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`#${rank}`, 75, startY + 36);

        let avatarImg = null;
        try {
            if (p.avatarURL) avatarImg = await loadImage(p.avatarURL);
        } catch {}

        if (avatarImg) {
            drawRoundImage(ctx, avatarImg, 130, startY + 10, 40);
        } else {
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(150, startY + 30, 20, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText((p.username || 'Jogador').slice(0, 18), 185, startY + 36);

        const total = (p.wins || 0) + (p.losses || 0) + (p.draws || 0);
        const wr = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0';
        ctx.fillStyle = '#2ecc71';
        ctx.font = '12px sans-serif';
        ctx.fillText(`TAXA DE VITÓRIA: ${wr}%`, 480, startY + 36);

        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(p.points, 725, startY + 38);

        startY += 70;
    }

    return canvas.toBuffer('image/png');
}

async function getRankedPlayers(db) {
    const players = Object.values(db.players)
        .filter(p => p.points > 0)
        .sort((a, b) => b.points - a.points);

    const enriched = [];
    for (const p of players) {
        const u = await client.users.fetch(p.userId).catch(() => null);
        enriched.push({
            userId: p.userId,
            points: p.points,
            wins: p.wins || 0,
            losses: p.losses || 0,
            draws: p.draws || 0,
            username: u ? u.username : 'Jogador',
            avatarURL: u ? u.displayAvatarURL({ extension: 'png', size: 128 }) : null
        });
    }
    return enriched;
}

async function buildTabelaMessage(players, page, dbSettings = {}) {
    const PER_PAGE = 4;
    const buffer = await generateRankingImage(players, page, dbSettings);
    const attachment = new AttachmentBuilder(buffer, { name: `tabela_pagina_${page + 1}.png` });

    const totalPages = Math.ceil(players.length / PER_PAGE) || 1;
    const ligaTitulo = dbSettings.ligaNome ? ` - ${dbSettings.ligaNome}` : '';
    const embed = new EmbedBuilder()
        .setTitle(`<a:brasil:1554216254187765960> Tabela de Classificação${ligaTitulo}`)
        .setColor(COLOR_MAP[dbSettings.ligaCor] || 0xE74C3C)
        .setImage(`attachment://tabela_pagina_${page + 1}.png`)
        .setTimestamp()
        .setFooter({ text: `Página ${page + 1} de ${totalPages}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tabela_prev_${page}`).setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`tabela_next_${page}`).setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled((page + 1) * PER_PAGE >= players.length)
    );

    return { embeds: [embed], files: [attachment], components: [row] };
}

client.once('ready', async () => {
    console.log(`Bot 1v1 online como ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('tabela')
            .setDescription('Mostra a tabela de classificação 1v1 em imagem')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' })),
        new SlashCommandBuilder()
            .setName('desafiar')
            .setDescription('Cria um desafio 1v1 com seleção de mapa')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
            .addUserOption(option => option.setName('adversario').setDescription('Deixe vazio para aleatório').setRequired(false)),
        new SlashCommandBuilder()
            .setName('analise')
            .setDescription('Mostra o painel de análise detalhado de um membro')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
            .addUserOption(option => option.setName('utilizador').setDescription('Membro a analisar (opcional)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('painel')
            .setDescription('Painel de controlo administrativo para gerir a liga e tabelas (Apenas Staff)')
            .setDMPermission(false),
        new SlashCommandBuilder()
            .setName('reset')
            .setDescription('Reseta a tabela e dados de 1v1 (Apenas Admins)')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Slash commands de 1v1 registados com sucesso!');
    } catch (error) {
        console.error('Erro ao registar comandos:', error);
    }
});

// --- Gestão de Comandos e Interações ---
client.on('interactionCreate', async interaction => {
    const db = loadDB();

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'tabela') {
            await interaction.deferReply();
            const players = await getRankedPlayers(db);
            if (players.length === 0) {
                return await interaction.editReply({ content: '⚠️ Ainda não existem jogadores com pontuação positiva na tabela 1v1!' });
            }
            try {
                const payload = await buildTabelaMessage(players, 0, db.settings);
                return await interaction.editReply(payload);
            } catch (err) {
                console.error('Erro ao gerar imagem da tabela:', err);
                return await interaction.editReply({ content: '❌ Erro ao gerar a imagem da tabela. Tenta novamente.' });
            }
        }

        if (commandName === 'desafiar') {
            const adversario = interaction.options.getUser('adversario');
            if (adversario && adversario.id === interaction.user.id) {
                return await interaction.reply({ content: '❌ Não podes desafiar a ti próprio!', ephemeral: true });
            }
            if (adversario && adversario.bot) {
                return await interaction.reply({ content: '❌ Não podes desafiar um bot!', ephemeral: true });
            }

            const titleStatus = adversario 
                ? `<a:carregando:1554216030128177152> AGUARDANDO ${adversario.username.toUpperCase()} ACEITAR DESAFIO` 
                : `<a:carregando:1554216030128177152> AGUARDANDO ALGUM MEMBRO ACEITAR`;

            const embed = new EmbedBuilder()
                .setTitle(titleStatus)
                .setDescription('Seleciona o mapa desejado no menu abaixo para publicar o desafio!')
                .setColor(0xFF4500)
                .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
                .addFields(
                    { name: '<:caveira:1554217228671516837> Desafiante', value: `${interaction.user}`, inline: true },
                    { name: '<:imprevisivel:1554217366823633048> Adversário', value: adversario ? `${adversario}` : '`Aberto a qualquer um`', inline: true },
                    { name: '<:analise:1554217532435595505> Regras', value: '• Vitória: **+32 pts** | Derrota: **-32 pts** | Empate: **+10 pts**', inline: false }
                );

            const mapSelect = new StringSelectMenuBuilder()
                .setCustomId(`escolher_mapa_${interaction.user.id}_${adversario ? adversario.id : 'aleatorio'}`)
                .setPlaceholder('🗺️ Selecione o mapa do confronto...')
                .addOptions([
                    { label: 'Homestead', value: 'Homestead', description: 'Jogar no mapa Homestead' },
                    { label: 'Airport', value: 'Airport', description: 'Jogar no mapa Airport' },
                    { label: 'Facility', value: 'Facility', description: 'Jogar no mapa Facility' },
                    { label: 'Abandoned Prison', value: 'Abandoned Prison', description: 'Jogar no mapa Abandoned Prison' },
                    { label: 'Arcade', value: 'Arcade', description: 'Jogar no mapa Arcade' },
                    { label: 'Abandoned Facility', value: 'Abandoned Facility', description: 'Jogar no mapa Abandoned Facility' }
                ]);

            const row = new ActionRowBuilder().addComponents(mapSelect);
            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'analise') {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('utilizador') || interaction.user;
            const pData = db.players[targetUser.id] || { points: 0, wins: 0, draws: 0, losses: 0 };

            const allPlayers = Object.values(db.players).sort((a, b) => b.points - a.points);
            const position = allPlayers.findIndex(p => p.userId === targetUser.id);
            const posText = position >= 0 ? position + 1 : allPlayers.length + 1;

            const memberObj = await interaction.guild.members.fetch(targetUser.id).catch(() => targetUser);

            try {
                const buffer = await generateAnaliseImage(memberObj, pData, posText, db.settings);
                const attachment = new AttachmentBuilder(buffer, { name: `analise_${targetUser.username}.png` });

                const embed = new EmbedBuilder()
                    .setTitle(`<:trofeu:1554216098319044621> Perfil de Desempenho - ${targetUser.username}`)
                    .setColor(COLOR_MAP[db.settings.ligaCor] || 0xE74C3C)
                    .setImage(`attachment://analise_${targetUser.username}.png`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed], files: [attachment] });
            } catch (err) {
                console.error('Erro ao gerar imagem de análise:', err);
                return await interaction.editReply({ content: '❌ Erro ao gerar o painel de análise.' });
            }
        }

        if (commandName === 'painel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '❌ Apenas membros com permissão de **Moderação** ou **Administrador** podem aceder a este painel!', ephemeral: true });
            }

            const settings = db.settings;
            const embed = new EmbedBuilder()
                .setTitle('<:moderao:1545806399169101854> Painel de Controle Administrativo - 1v1')
                .setDescription(
                    `Gerencie as configurações visuais, cargos e da liga atual diretamente por aqui.\n\n` +
                    `<:trofeu:1554216098319044621> **Liga Atual:** \`${settings.ligaNome || 'Não configurado'}\`\n` +
                    `<:custo:1554216373285163100> **Cor Temática:** \`${settings.ligaCor}\`\n` +
                    `<:engrenagem:1554223036948021249> **Cargo de Ping (Desafiar):** ${settings.cargoProcurando ? `<@&${settings.cargoProcurando}>` : '`Nenhum`'}\n` +
                    `<:tro:1554226308224131184> **Cargo Top 1:** ${settings.cargoTop1 ? `<@&${settings.cargoTop1}>` : '`Nenhum`'}\n` +
                    `<:tro2:1554226635908321293> **Cargo Top 2:** ${settings.cargoTop2 ? `<@&${settings.cargoTop2}>` : '`Nenhum`'}\n` +
                    `<:tro3:1554226883183247371> **Cargo Top 3:** ${settings.cargoTop3 ? `<@&${settings.cargoTop3}>` : '`Nenhum`'}`
                )
                .setColor(COLOR_MAP[settings.ligaCor] || 0xE74C3C)
                .setTimestamp();

            const rowButtons1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('painel_mudar_titulo').setLabel('Mudar Título').setStyle(ButtonStyle.Primary).setEmoji('1554222927476691064'),
                new ButtonBuilder().setCustomId('painel_mudar_cor').setLabel('Mudar Cor').setStyle(ButtonStyle.Secondary).setEmoji('1554216373285163100'),
                new ButtonBuilder().setCustomId('painel_config_cargos').setLabel('Configurar Cargos').setStyle(ButtonStyle.Success).setEmoji('1554223036948021249'),
                new ButtonBuilder().setCustomId('painel_nova_liga').setLabel('Nova Liga (Reset)').setStyle(ButtonStyle.Danger).setEmoji('1554222826951540817')
            );

            return await interaction.reply({ embeds: [embed], components: [rowButtons1] });
        }

        if (commandName === 'reset') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '❌ Apenas administradores podem usar este comando!', ephemeral: true });
            }
            db.players = {};
            saveDB(db);
            return await interaction.reply({ content: '🔄 A tabela e os dados de 1v1 foram resetados com sucesso!', ephemeral: true });
        }
    }

    // --- INTERAÇÕES DE BOTÕES E MENUS DO PAINEL ---
    if (interaction.isButton() && interaction.customId.startsWith('painel_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({ content: '❌ Não tens permissão para usar estes botões.', ephemeral: true });
        }

        if (interaction.customId === 'painel_mudar_titulo') {
            const modal = new ModalBuilder()
                .setCustomId('modal_mudar_titulo')
                .setTitle('Alterar Título da Liga');

            const inputTitulo = new TextInputBuilder()
                .setCustomId('input_novo_titulo')
                .setLabel('Novo Nome / Título da Liga')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: SFC 1V1 - SEASON 2')
                .setRequired(true)
                .setMaxLength(50);

            modal.addComponents(new ActionRowBuilder().addComponents(inputTitulo));
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'painel_mudar_cor') {
            const selectCor = new StringSelectMenuBuilder()
                .setCustomId('select_cor_tabela')
                .setPlaceholder('🎨 Selecione a cor de fundo/detalhe...')
                .addOptions([
                    { label: 'Lavanda', value: 'lavanda', description: 'Tom roxo suave' },
                    { label: 'Azul', value: 'azul', description: 'Azul clássico' },
                    { label: 'Dourado', value: 'dourado', description: 'Amarelo dourado premium' },
                    { label: 'Verde', value: 'verde', description: 'Verde esmeralda' },
                    { label: 'Cinza', value: 'cinza', description: 'Cinza escuro elegante' },
                    { label: 'Branco', value: 'branco', description: 'Branco claro' },
                    { label: 'Rosa', value: 'rosa', description: 'Rosa vibrante' },
                    { label: 'Amarelo', value: 'amarelo', description: 'Amarelo vivo' },
                    { label: 'Ciano', value: 'ciano', description: 'Azul ciano brilhante' }
                ]);

            const row = new ActionRowBuilder().addComponents(selectCor);
            return await interaction.reply({ content: 'Selecione abaixo a nova cor de fundo para o painel e tabela:', components: [row], ephemeral: true });
        }

        if (interaction.customId === 'painel_config_cargos') {
            const selectRoleProcurando = new RoleSelectMenuBuilder()
                .setCustomId('role_select_procurando')
                .setPlaceholder('🛡️ Selecione o cargo de Ping para Desafios...')
                .setMinValues(1)
                .setMaxValues(1);

            const selectRoleTop1 = new RoleSelectMenuBuilder()
                .setCustomId('role_select_top1')
                .setPlaceholder('🥇 Selecione o cargo de Top 1...')
                .setMinValues(1)
                .setMaxValues(1);

            const selectRoleTop2 = new RoleSelectMenuBuilder()
                .setCustomId('role_select_top2')
                .setPlaceholder('🥈 Selecione o cargo de Top 2...')
                .setMinValues(1)
                .setMaxValues(1);

            const selectRoleTop3 = new RoleSelectMenuBuilder()
                .setCustomId('role_select_top3')
                .setPlaceholder('🥉 Selecione o cargo de Top 3...')
                .setMinValues(1)
                .setMaxValues(1);

            return await interaction.reply({ 
                content: 'Selecione abaixo os cargos que o bot deve atribuir e controlar automaticamente:', 
                components: [
                    new ActionRowBuilder().addComponents(selectRoleProcurando),
                    new ActionRowBuilder().addComponents(selectRoleTop1),
                    new ActionRowBuilder().addComponents(selectRoleTop2),
                    new ActionRowBuilder().addComponents(selectRoleTop3)
                ], 
                ephemeral: true 
            });
        }

        if (interaction.customId === 'painel_nova_liga') {
            const modal = new ModalBuilder()
                .setCustomId('modal_nova_liga')
                .setTitle('Criar Nova Liga');

            const inputNome = new TextInputBuilder()
                .setCustomId('input_nome_nova_liga')
                .setLabel('Nome da Nova Liga')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: SFC 1V1 - SEASON 2')
                .setRequired(true)
                .setMaxLength(50);

            modal.addComponents(new ActionRowBuilder().addComponents(inputNome));
            return await interaction.showModal(modal);
        }
    }

    // --- SELEÇÃO DE CARGOS VIA MENU ---
    if (interaction.isRoleSelectMenu()) {
        if (interaction.customId === 'role_select_procurando') {
            db.settings.cargoProcurando = interaction.values[0];
            saveDB(db);
            return await interaction.update({ content: `✅ Cargo de ping para desafios atualizado com sucesso para <@&${interaction.values[0]}>!`, components: [] });
        }
        if (interaction.customId === 'role_select_top1') {
            db.settings.cargoTop1 = interaction.values[0];
            saveDB(db);
            await atualizarCargosPodio(interaction.guild, db);
            return await interaction.update({ content: `✅ Cargo de Top 1 atualizado para <@&${interaction.values[0]}> e aplicado ao líder atual!`, components: [] });
        }
        if (interaction.customId === 'role_select_top2') {
            db.settings.cargoTop2 = interaction.values[0];
            saveDB(db);
            await atualizarCargosPodio(interaction.guild, db);
            return await interaction.update({ content: `✅ Cargo de Top 2 atualizado para <@&${interaction.values[0]}> e aplicado!`, components: [] });
        }
        if (interaction.customId === 'role_select_top3') {
            db.settings.cargoTop3 = interaction.values[0];
            saveDB(db);
            await atualizarCargosPodio(interaction.guild, db);
            return await interaction.update({ content: `✅ Cargo de Top 3 atualizado para <@&${interaction.values[0]}> e aplicado!`, components: [] });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_cor_tabela') {
        const novaCor = interaction.values[0];
        db.settings.ligaCor = novaCor;
        saveDB(db);
        return await interaction.update({ content: `✅ Cor de fundo da tabela alterada com sucesso para **${novaCor.toUpperCase()}**!`, components: [] });
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_mudar_titulo') {
            const novoTitulo = interaction.fields.getTextInputValue('input_novo_titulo');
            db.settings.ligaNome = novoTitulo;
            saveDB(db);
            return await interaction.reply({ content: `✅ Título da liga atualizado com sucesso para: \`${novoTitulo}\``, ephemeral: true });
        }

        if (interaction.customId === 'modal_nova_liga') {
            const novoNome = interaction.fields.getTextInputValue('input_nome_nova_liga');
            
            db.players = {};
            db.settings.ligaNome = novoNome;
            saveDB(db);
            await atualizarCargosPodio(interaction.guild, db);

            return await interaction.reply({ 
                content: `🚨 **Nova liga criada com sucesso!**\n• A tabela anterior foi limpa/excluída.\n• **Nome da Nova Liga:** \`${novoNome}\``, 
                ephemeral: true 
            });
        }
    }

    // --- Outras interações (Desafios, Mapas e Tabela Páginas) ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('escolher_mapa_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const targetId = parts[3];
        const mapa = interaction.values[0];

        if (interaction.user.id !== challengerId) {
            return await interaction.reply({ content: '❌ Apenas quem criou o desafio pode escolher o mapa!', ephemeral: true });
        }

        let targetUserObj = null;
        if (targetId !== 'aleatorio') {
            targetUserObj = await client.users.fetch(targetId).catch(() => null);
        }

        const titleStatus = targetUserObj 
            ? `<a:carregando:1554216030128177152> AGUARDANDO ${targetUserObj.username.toUpperCase()} ACEITAR DESAFIO` 
            : `<a:carregando:1554216030128177152> AGUARDANDO ALGUM MEMBRO ACEITAR`;

        const embed = new EmbedBuilder()
            .setTitle(titleStatus)
            .setDescription('Um combate foi criado. Clica no botão abaixo para aceitar o duelo!')
            .setColor(0xFF4500)
            .setThumbnail((await client.users.fetch(challengerId).catch(() => null))?.displayAvatarURL({ extension: 'png' }))
            .addFields(
                { name: '<:caveira:1554217228671516837> Desafiante', value: `${interaction.user}`, inline: true },
                { name: '<:imprevisivel:1554217366823633048> Adversário', value: targetId !== 'aleatorio' ? `${targetUserObj}` : '`Aberto a qualquer um`', inline: true },
                { name: '🗺 Mapa', value: `\`${mapa}\``, inline: false },
                { name: '<:analise:1554217532435595505> Regras', value: '• Vitória: **+32 pts** | Derrota: **-32 pts** | Empate: **+10 pts**', inline: false }
            );

        const btnAccept = new ButtonBuilder()
            .setCustomId(`aceitar_desafio_${challengerId}_${targetId}_${encodeURIComponent(mapa)}`)
            .setLabel('Aceitar Desafio')
            .setEmoji('1551829027801800714') 
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(btnAccept);
        const cargoPing = db.settings.cargoProcurando;
        const content = cargoPing ? `<@&${cargoPing}>` : '';

        await interaction.channel.send({ content, embeds: [embed], components: [row] });
        await interaction.update({ content: '✅ Desafio publicado com sucesso no canal!', embeds: [], components: [] });
    }

    if (interaction.isButton() && (interaction.customId.startsWith('tabela_prev_') || interaction.customId.startsWith('tabela_next_'))) {
        await interaction.deferUpdate();
        const pageChange = interaction.customId.startsWith('tabela_next_') ? 1 : -1;
        const currentPage = parseInt(interaction.customId.split('_').pop(), 10);
        const newPage = currentPage + pageChange;

        const players = await getRankedPlayers(db);
        if (players.length === 0) {
            return await interaction.editReply({ content: '⚠️ A tabela está vazia agora.', embeds: [], files: [], components: [] });
        }

        try {
            const payload = await buildTabelaMessage(players, newPage, db.settings);
            return await interaction.editReply(payload);
        } catch (err) {
            console.error('Erro ao paginar tabela:', err);
            return await interaction.followUp({ content: '❌ Erro ao mudar de página.', ephemeral: true });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('aceitar_desafio_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const targetId = parts[3];
        const mapa = decodeURIComponent(parts[4]);

        if (interaction.user.id === challengerId) {
            return await interaction.reply({ content: '❌ Não podes aceitar o teu próprio desafio!', ephemeral: true });
        }
        if (targetId !== 'aleatorio' && interaction.user.id !== targetId) {
            return await interaction.reply({ content: '❌ Este desafio foi direcionado para outro jogador!', ephemeral: true });
        }

        try {
            const thread = await interaction.message.startThread({
                name: `1v1-${interaction.user.username}`,
                autoArchiveDuration: 60,
                type: ChannelType.PublicThread,
                reason: 'Partida 1v1'
            });

            const embedThread = new EmbedBuilder()
                .setTitle('⚔️ SALA DE CONFRONTO 1v1')
                .setDescription(
                    `**Participantes:** <@${challengerId}> ⚔️ <@${interaction.user.id}>\n` +
                    `**Mapa:** \`${mapa}\`\n\n` +
                    `### 📌 Regras e Instruções do Tópico:\n` +
                    `1. **Envie o link do servidor privado** aqui no tópico para irem para o 1v1.\n` +
                    `2. Ambos os participantes podem enviar mensagens livremente.\n` +
                    `3. Joguem a partida no mapa indicado.\n` +
                    `4. Após o jogo, **ambos** devem selecionar o resultado exato no menu abaixo.\n` +
                    `⚠️ *Nota: O cancelamento exige que ambos cliquem no botão de cancelar.*`
                )
                .setColor(0x00FF99);

            const selectMenuResult = new StringSelectMenuBuilder()
                .setCustomId(`resultado_1v1_${challengerId}_${interaction.user.id}`)
                .setPlaceholder('Selecione o resultado exato do confronto...')
                .addOptions([
                    { label: 'Desafiante (1-0)', value: 'desafiante_1_0', description: 'Desafiante venceu por 1 a 0' },
                    { label: 'Adversário (1-0)', value: 'adversario_1_0', description: 'Adversário venceu por 1 a 0' },
                    { label: 'Desafiante (2-1)', value: 'desafiante_2_1', description: 'Desafiante venceu por 2 a 1' },
                    { label: 'Desafiante (2-0)', value: 'desafiante_2_0', description: 'Desafiante venceu por 2 a 0' },
                    { label: 'Adversário (2-1)', value: 'adversario_2_1', description: 'Adversário venceu por 2 a 1' },
                    { label: 'Adversário (2-0)', value: 'adversario_2_0', description: 'Adversário venceu por 2 a 0' },
                    { label: 'Empate Ambos', value: 'empate', description: 'A partida terminou em empate (+10 pts para cada)' }
                ]);

            const btnCancel = new ButtonBuilder()
                .setCustomId(`cancelar_desafio_${challengerId}_${interaction.user.id}`)
                .setLabel('❌ Cancelar Desafio (0/2)')
                .setStyle(ButtonStyle.Danger);

            const rowResult = new ActionRowBuilder().addComponents(selectMenuResult);
            const rowCancel = new ActionRowBuilder().addComponents(btnCancel);

            await thread.send({ 
                content: `⚔️ <@${challengerId}> e <@${interaction.user.id}> o vosso tópico foi criado!`, 
                embeds: [embedThread], 
                components: [rowResult, rowCancel] 
            });

            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setTitle('<a:carregando:1554216030128177152> Desafio em andamento')
                .setColor(0xF1C40F);

            const fields = originalEmbed.data.fields;
            if (fields && fields[1]) {
                fields[1].value = `<@${interaction.user.id}>`;
            }

            await interaction.update({ embeds: [originalEmbed], components: [] });

            const timeoutHandle = setTimeout(async () => {
                try {
                    const fetchedChannel = await client.channels.fetch(thread.id).catch(() => null);
                    if (fetchedChannel) {
                        await fetchedChannel.send('⚠️ O tempo limite de 2 horas expirou. O desafio foi cancelado automaticamente por inatividade.');
                        setTimeout(async () => { try { await fetchedChannel.delete(); } catch (e) {} }, 5000);
                    }
                    const starterMessage = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
                    if (starterMessage) await starterMessage.delete().catch(() => {});
                } catch (e) {}
            }, 2 * 60 * 60 * 1000);

            interaction.client.matchTimeouts = interaction.client.matchTimeouts || new Map();
            interaction.client.matchTimeouts.set(thread.id, timeoutHandle);

        } catch (err) {
            console.error(err);
            return await interaction.reply({ content: '❌ Erro ao criar o tópico.', ephemeral: true });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('cancelar_desafio_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const acceptorId = parts[3];

        if (interaction.user.id !== challengerId && interaction.user.id !== acceptorId) {
            return await interaction.reply({ content: '❌ Apenas os participantes podem cancelar o desafio!', ephemeral: true });
        }

        interaction.client.cancelVotes = interaction.client.cancelVotes || new Map();
        let cancelSet = interaction.client.cancelVotes.get(interaction.channelId) || new Set();
        cancelSet.add(interaction.user.id);
        interaction.client.cancelVotes.set(interaction.channelId, cancelSet);

        const count = cancelSet.size;

        if (count < 2) {
            try {
                const actionRows = interaction.message.components;
                for (let r of actionRows) {
                    for (let comp of r.components) {
                        if (comp.customId && comp.customId.startsWith('cancelar_desafio_')) {
                            comp.data.label = `❌ Cancelar Desafio (${count}/2)`;
                        }
                    }
                }
                await interaction.update({ components: actionRows });
            } catch (e) {}

            return await interaction.followUp({ content: `⚠️ <@${interaction.user.id}> votou para cancelar. Falta o voto do outro participante (**${count}/2**).` });
        } else {
            if (interaction.client.matchTimeouts?.has(interaction.channelId)) {
                clearTimeout(interaction.client.matchTimeouts.get(interaction.channelId));
                interaction.client.matchTimeouts.delete(interaction.channelId);
            }
            interaction.client.cancelVotes.delete(interaction.channelId);

            try {
                const starterMessage = await interaction.channel.fetchStarterMessage().catch(() => null);
                if (starterMessage) await starterMessage.delete().catch(() => {});
            } catch (e) {}

            const embedCancel = new EmbedBuilder()
                .setTitle('❌ DESAFIO CANCELADO')
                .setDescription(`Ambos os participantes concordaram em cancelar o confronto. Este canal será eliminado em 5 segundos.`)
                .setColor(0xFF0000);

            await interaction.update({ content: '', embeds: [embedCancel], components: [] });
            setTimeout(async () => { try { await interaction.channel.delete(); } catch (e) {} }, 5000);
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('resultado_1v1_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const acceptorId = parts[3];

        if (interaction.user.id !== challengerId && interaction.user.id !== acceptorId) {
            return await interaction.reply({ content: '❌ Apenas os participantes podem votar!', ephemeral: true });
        }

        interaction.client.pendingResults = interaction.client.pendingResults || new Map();
        let matchVotes = interaction.client.pendingResults.get(interaction.channelId) || {};
        matchVotes[interaction.user.id] = interaction.values[0];
        interaction.client.pendingResults.set(interaction.channelId, matchVotes);

        await interaction.reply({ content: `✅ Voto registado com sucesso. A aguardar o adversário...`, ephemeral: true });

        if (matchVotes[challengerId] && matchVotes[acceptorId]) {
            if (matchVotes[challengerId] !== matchVotes[acceptorId]) {
                await interaction.channel.send('⚠️ Os votos não coincidem! Dialoguem e votem novamente.');
                interaction.client.pendingResults.delete(interaction.channelId);
                return;
            }

            if (interaction.client.matchTimeouts?.has(interaction.channelId)) {
                clearTimeout(interaction.client.matchTimeouts.get(interaction.channelId));
                interaction.client.matchTimeouts.delete(interaction.channelId);
            }

            const result = matchVotes[challengerId];
            let winnerId = null, loserId = null, isDraw = false;
            let scoreText = '';

            if (result.startsWith('desafiante_')) {
                winnerId = challengerId;
                loserId = acceptorId;
                if (result === 'desafiante_1_0') scoreText = '1-0';
                if (result === 'desafiante_2_1') scoreText = '2-1';
                if (result === 'desafiante_2_0') scoreText = '2-0';
            } else if (result.startsWith('adversario_')) {
                winnerId = acceptorId;
                loserId = challengerId;
                if (result === 'adversario_1_0') scoreText = '1-0';
                if (result === 'adversario_2_1') scoreText = '2-1';
                if (result === 'adversario_2_0') scoreText = '2-0';
            } else if (result === 'empate') {
                isDraw = true;
            }

            if (!db.players[challengerId]) db.players[challengerId] = { userId: challengerId, points: 0, wins: 0, draws: 0, losses: 0 };
            if (!db.players[acceptorId]) db.players[acceptorId] = { userId: acceptorId, points: 0, wins: 0, draws: 0, losses: 0 };

            if (isDraw) {
                db.players[challengerId].points += 10;
                db.players[challengerId].draws += 1;
                db.players[acceptorId].points += 10;
                db.players[acceptorId].draws += 1;
            } else {
                db.players[winnerId].points += 32;
                db.players[winnerId].wins += 1;
                db.players[loserId].points -= 32;
                db.players[loserId].losses += 1;
            }

            saveDB(db);
            await atualizarCargosPodio(interaction.guild, db);
            interaction.client.pendingResults.delete(interaction.channelId);

            let winnerUserObj = null;
            if (!isDraw) {
                winnerUserObj = await client.users.fetch(winnerId).catch(() => null);
            }

            const textResult = isDraw 
                ? '<a:verificado:1554216178111610932> Desafio finalizado ambos empataram' 
                : `<a:verificado:1554216178111610932> Desafio finalizado o vencedor foi ${winnerUserObj ? winnerUserObj.username : 'Desconhecido'}`;

            try {
                const starterMessage = await interaction.channel.fetchStarterMessage().catch(() => null);
                if (starterMessage) {
                    const parentChannel = starterMessage.channel;
                    await starterMessage.delete().catch(() => {});

                    const finalEmbed = new EmbedBuilder()
                        .setTitle(textResult)
                        .setColor(0x00FF00)
                        .addFields(
                            { name: '<:caveira:1554217228671516837> Desafiante', value: `<@${challengerId}>`, inline: true },
                            { name: '<:imprevisivel:1554217366823633048> Adversário', value: `<@${acceptorId}>`, inline: true },
                            { name: '📊 Placar', value: `\`${isDraw ? 'Empate' : scoreText}\``, inline: false }
                        )
                        .setTimestamp();

                    await parentChannel.send({ embeds: [finalEmbed] });
                }
            } catch (e) {}

            const embedFinal = new EmbedBuilder()
                .setTitle('<:tro:1554226308224131184> CONFRONTO CONCLUÍDO!')
                .setDescription(`${textResult} (${isDraw ? 'Empate' : 'Placar: ' + scoreText})`)
                .setColor(0x00FF00);

            await interaction.channel.send({ embeds: [embedFinal] });
            setTimeout(async () => { try { await interaction.channel.delete(); } catch (e) {} }, 5000);
        }
    }
});

client.login(TOKEN);
