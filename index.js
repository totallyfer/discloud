import { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
  TextInputStyle, ChannelType 
} from 'discord.js';
import QRCode from 'qrcode';
import { db } from './database.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Registrar Comandos Slash
const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Painel avançado de configuração da loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('Gerencia produtos, cupons, Pix, cargos e visual da loja')
    ),
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Envia o painel profissional de atendimento e vendas')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('Envia o painel configurado em um canal específico')
        .addChannelOption(option =>
          option.setName('canal').setDescription('Canal onde o painel será enviado').setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag} (Loja Completa com Aprovação de Staff)`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Comandos slash registrados com sucesso.');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async interaction => {
  db.read();

  // Configurações padrão de visual e cargos
  db.data.shopEmbed = db.data.shopEmbed || {
    title: '🛒 Central de Atendimento & Vendas',
    description: 'Seja muito bem-vindo(a) à nossa central de vendas automatizada!\n\nClique no botão abaixo para abrir seu carrinho.',
    color: '#9D00FF',
    image: 'https://images.unsplash.com/photo-1607532940433-1d604d1efc91?w=800&auto=format&fit=crop&q=60'
  };
  db.data.staffRoleId = db.data.staffRoleId || null;
  db.data.tickets = db.data.tickets || {};

  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    if (commandName === 'config') {
      if (options.getSubcommand() === 'shop') {
        const staffRoleText = db.data.staffRoleId ? `<@&${db.data.staffRoleId}>` : 'Não configurado (Apenas Admins)';

        const embed = new EmbedBuilder()
          .setTitle('⚙️ Painel de Controle Avançado da Loja')
          .setDescription('Gerencie produtos, cupons, chaves Pix, **cargo da equipe** e personalize a embed:')
          .addFields(
            { name: '📦 Produtos', value: `${Object.keys(db.data.products).length} cadastrados`, inline: true },
            { name: '💳 Pix', value: db.data.pix.value ? 'Configurado ✅' : 'Pendente ❌', inline: true },
            { name: '🛡️ Cargo de Aprovação', value: staffRoleText, inline: true }
          )
          .setColor('#8A2BE2');

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_add_prod').setLabel('➕ Add Produto').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_del_prod').setLabel('🗑️ Del Produto').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cfg_list_prod').setLabel('📦 Ver Produtos').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_pix').setLabel('💳 Configurar Pix').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cfg_coupon').setLabel('🎟️ Criar Cupom').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_set_role').setLabel('🛡️ Configurar Cargo Staff').setStyle(ButtonStyle.Secondary)
        );

        const row3 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_edit_embed').setLabel('✏️ Personalizar Embed').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
          new ButtonBuilder().setCustomId('cfg_preview_embed').setLabel('👁️ Visualizar Embed').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row1, row2, row3], ephemeral: true });
      }
    }

    if (commandName === 'start') {
      if (options.getSubcommand() === 'shop') {
        const channel = options.getChannel('canal');
        db.data.shopChannel = channel.id;
        db.write();

        const cfg = db.data.shopEmbed;
        const shopEmbed = new EmbedBuilder()
          .setTitle(cfg.title)
          .setDescription(cfg.description)
          .setColor(cfg.color)
          .setImage(cfg.image)
          .setFooter({ text: 'Sistema de Vendas Automatizado' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket').setLabel('🛒 Abrir Carrinho / Comprar').setStyle(ButtonStyle.Success).setEmoji('💳'),
          new ButtonBuilder().setCustomId('faq_rules').setLabel('📄 Termos e Regras').setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ embeds: [shopEmbed], components: [row] });
        await interaction.reply({ content: `✅ Painel de vendas publicado em ${channel}!`, ephemeral: true });
      }
    }
  }

  // --- BOTÕES DE GERENCIAMENTO DA CONFIG ---
  else if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId === 'cfg_add_prod') {
      const modal = new ModalBuilder().setCustomId('modal_add_prod').setTitle('Cadastrar Novo Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('ID Único (ex: vip1)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_name').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_price').setLabel('Preço (Apenas números, ex: 15.00)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_pix') {
      const modal = new ModalBuilder().setCustomId('modal_set_pix').setTitle('Configurar Pix');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix_type').setLabel('Tipo (Chave, CNPJ, Email, Tel)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix_val').setLabel('Chave Pix ou Código Copia e Cola').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_set_role') {
      const modal = new ModalBuilder().setCustomId('modal_set_role').setTitle('Configurar Cargo da Staff');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do Cargo que pode Aprovar Pagamentos').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_edit_embed') {
      const cfg = db.data.shopEmbed;
      const modal = new ModalBuilder().setCustomId('modal_edit_embed').setTitle('Personalizar Embed da Loja');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embed_title').setLabel('Título da Embed').setValue(cfg.title).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embed_desc').setLabel('Descrição').setValue(cfg.description).setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embed_color').setLabel('Cor Hex (ex: #9D00FF)').setValue(cfg.color).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embed_image').setLabel('URL do Banner').setValue(cfg.image).setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_preview_embed') {
      const cfg = db.data.shopEmbed;
      const previewEmbed = new EmbedBuilder()
        .setTitle(cfg.title)
        .setDescription(cfg.description)
        .setColor(cfg.color)
        .setImage(cfg.image)
        .setFooter({ text: 'Pré-visualização da Loja' });
      await interaction.reply({ embeds: [previewEmbed], ephemeral: true });
    }

    if (customId === 'cfg_list_prod') {
      const prods = Object.entries(db.data.products);
      if (prods.length === 0) return interaction.reply({ content: '⚠️ Nenhum produto cadastrado.', ephemeral: true });
      const list = prods.map(([id, p]) => `🔹 **ID:** \`${id}\` | **Nome:** ${p.name} | **Preço:** R$ ${p.price}`).join('\n');
      await interaction.reply({ content: `📦 **Produtos:**\n\n${list}`, ephemeral: true });
    }

    // --- ABRIR TICKET / CARRINHO ---
    if (customId === 'open_ticket') {
      const guild = interaction.guild;
      const channelName = `carrinho-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      // Salva o dono do ticket
      db.data.tickets[ticketChannel.id] = { ownerId: interaction.user.id };
      db.write();

      const products = Object.entries(db.data.products);
      if (products.length === 0) {
        await ticketChannel.send({ content: `${interaction.user}, carrinho aberto, mas não há produtos cadastrados.` });
        return interaction.reply({ content: `✅ Carrinho criado: ${ticketChannel}`, ephemeral: true });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_product')
        .setPlaceholder('🛒 Selecione o produto desejado')
        .addOptions(products.map(([id, p]) => ({
          label: p.name,
          description: `Preço: R$ ${p.price}`,
          value: id
        })));

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      await ticketChannel.send({ 
        content: `Olá ${interaction.user}, selecione o produto que deseja comprar abaixo:`, 
        components: [row] 
      });

      await interaction.reply({ content: `✅ Carrinho criado com sucesso: ${ticketChannel}`, ephemeral: true });
    }

    // Copiar Chave Pix
    if (customId === 'copy_pix_key') {
      const pixValue = db.data.pix.value || 'Chave Pix não configurada.';
      await interaction.reply({ content: `📋 **Código Pix Copia e Cola:**\n\`\`\`text\n${pixValue}\n\`\`\``, ephemeral: true });
    }

    // CLIENTE APERTA EM "CONFIRMAR PAGAMENTO"
    if (customId === 'notify_payment') {
      const staffRoleMention = db.data.staffRoleId ? `<@&${db.data.staffRoleId}>` : '@everyone';

      const embedNotify = new EmbedBuilder()
        .setTitle('🚨 Aguardando Validação do Pagamento')
        .setDescription(`O cliente ${interaction.user} informou que realizou o pagamento!\n\n` +
                        `Aguardando um membro da equipe com o cargo correto para **Aprovar o Pagamento**.`)
        .setColor('#FFA500');

      const staffRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('approve_payment').setLabel('✅ Confirmar Pagamento').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Danger)
      );

      await interaction.channel.send({ content: staffRoleMention, embeds: [embedNotify], components: [staffRow] });
      await interaction.reply({ content: '✅ Notificação enviada para a equipe! Aguarde a confirmação do atendente.', ephemeral: true });
    }

    // STAFF APERTA EM "CONFIRMAR PAGAMENTO"
    if (customId === 'approve_payment') {
      const member = interaction.member;
      const requiredRoleId = db.data.staffRoleId;

      // Verifica se o usuário tem permissão (Admin ou Cargo configurado)
      const hasPermission = member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                            (requiredRoleId && member.roles.cache.has(requiredRoleId));

      if (!hasPermission) {
        return interaction.reply({ 
          content: '❌ **Acesso Negado!** Apenas membros autorizados da equipe podem confirmar este pagamento.', 
          ephemeral: true 
        });
      }

      // Identifica o dono do ticket
      const ticketInfo = db.data.tickets[interaction.channel.id];
      const buyerId = ticketInfo ? ticketInfo.ownerId : null;

      // Tenta enviar mensagem na DM do cliente
      if (buyerId) {
        try {
          const buyer = await client.users.fetch(buyerId);
          const dmEmbed = new EmbedBuilder()
            .setTitle('🎉 Compra Aprovada!')
            .setDescription(`Seu pagamento no servidor **${interaction.guild.name}** foi confirmado com sucesso!\n\nRetorne ao canal do seu ticket para receber o seu produto.`)
            .setColor('#00FF7F')
            .setTimestamp();
          await buyer.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log('Não foi possível enviar mensagem na DM do usuário (DM fechada).');
        }
      }

      // Mensagem no Ticket
      const approvedEmbed = new EmbedBuilder()
        .setTitle('✅ Compra Aprovada com Sucesso!')
        .setDescription('**Seu pagamento foi confirmado! Espere seu produto ser entregue pela equipe.**')
        .setColor('#00FF7F')
        .setFooter({ text: `Aprovado por ${interaction.user.tag}` });

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ embeds: [approvedEmbed], components: [closeRow] });
    }

    if (customId === 'close_ticket') {
      await interaction.reply({ content: '🔒 Fechando este canal em 5 segundos...' });
      setTimeout(() => {
        delete db.data.tickets[interaction.channel.id];
        db.write();
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  }

  // --- SELEÇÃO DE PRODUTO NO CARRINHO ---
  else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_product') {
      const prodId = interaction.values[0];
      const product = db.data.products[prodId];
      const pix = db.data.pix;

      if (!product) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

      let qrCodeAttachment = null;
      if (pix.value) {
        try {
          const buffer = await QRCode.toBuffer(pix.value);
          qrCodeAttachment = { attachment: buffer, name: 'qrcode.png' };
        } catch (e) {
          console.error(e);
        }
      }

      const checkoutEmbed = new EmbedBuilder()
        .setTitle(`💳 Checkout - ${product.name}`)
        .setDescription(`Você selecionou **${product.name}**.\n\n` +
                        `💰 **Valor:** \`R$ ${product.price}\`\n\n` +
                        `📲 *Escaneie o QR Code abaixo ou clique no botão para copiar a chave Pix.*`)
        .setColor('#00FF7F');

      if (qrCodeAttachment) checkoutEmbed.setImage('attachment://qrcode.png');

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('copy_pix_key').setLabel('📋 Copiar Pix').setStyle(ButtonStyle.Primary).setEmoji('🔑'),
        new ButtonBuilder().setCustomId('notify_payment').setLabel('📩 Notificar Pagamento').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ 
        content: '🛒 **Produto Selecionado!** Efetue o pagamento abaixo:', 
        embeds: [checkoutEmbed], 
        files: qrCodeAttachment ? [qrCodeAttachment] : [],
        components: [actionRow] 
      });
    }
  }

  // --- MODAIS ---
  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_add_prod') {
      const id = interaction.fields.getTextInputValue('prod_id').toLowerCase();
      const name = interaction.fields.getTextInputValue('prod_name');
      const price = interaction.fields.getTextInputValue('prod_price');
      const desc = interaction.fields.getTextInputValue('prod_desc');

      db.data.products[id] = { name, price, desc };
      db.write();
      await interaction.reply({ content: `✅ Produto **${name}** cadastrado!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_set_pix') {
      const type = interaction.fields.getTextInputValue('pix_type');
      const value = interaction.fields.getTextInputValue('pix_val');

      db.data.pix = { type, value };
      db.write();
      await interaction.reply({ content: `✅ Dados do Pix salvos!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_set_role') {
      const roleId = interaction.fields.getTextInputValue('role_id').trim();
      db.data.staffRoleId = roleId;
      db.write();
      await interaction.reply({ content: `✅ Cargo da equipe atualizado para <@&${roleId}>!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_edit_embed') {
      const title = interaction.fields.getTextInputValue('embed_title');
      const description = interaction.fields.getTextInputValue('embed_desc').replace(/\\n/g, '\n');
      const color = interaction.fields.getTextInputValue('embed_color');
      const image = interaction.fields.getTextInputValue('embed_image');

      db.data.shopEmbed = { title, description, color, image };
      db.write();

      await interaction.reply({ content: `✅ **Embed atualizada com sucesso!**`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
