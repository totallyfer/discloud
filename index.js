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

// Comandos Slash
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
  console.log(`Bot conectado como ${client.user.tag} (Painel Padrão Visual IDêntico)`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Comandos slash registrados com sucesso.');
  } catch (error) {
    console.error(error);
  }
});

const userSessions = new Map();

client.on('interactionCreate', async interaction => {
  db.read();

  // Valores padrão estruturados igualzinho ao modelo de referência
  db.data.shopEmbed = db.data.shopEmbed || {
    title: '🛒 Compre Aqui',
    description: '✨ **ESCOLHA UMA DAS OPÇÕES PARA COMPRAR!**\n\n' +
                  '• **Criar Carrinho:** Monte seu carrinho, escolha o item e insira cupons antes de abrir o atendimento.\n' +
                  '• **Atendente:** Tire suas dúvidas diretamente com nossa equipe.',
    color: '#E02B2B',
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
        
        // A ordem exata: Título ➔ Descrição ➔ Imagem/Banner embaixo
        const shopEmbed = new EmbedBuilder()
          .setTitle(cfg.title)
          .setDescription(cfg.description)
          .setColor(cfg.color)
          .setImage(cfg.image); // Banner posicionado exatamente abaixo da descrição

        // Botões idênticos ao layout da imagem de referência
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_create_cart').setLabel('Criar Carrinho').setStyle(ButtonStyle.Success).setEmoji('🛍️'),
          new ButtonBuilder().setCustomId('btn_support').setLabel('Atendente').setStyle(ButtonStyle.Danger).setEmoji('🎧')
        );

        await channel.send({ embeds: [shopEmbed], components: [row1] });
        await interaction.reply({ content: `✅ Painel de vendas estilo idêntico publicado em ${channel}!`, ephemeral: true });
      }
    }
  }

  // --- INTERAÇÕES DE BOTÕES E FLUXO ---
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

    if (customId === 'cfg_coupon') {
      const modal = new ModalBuilder().setCustomId('modal_add_coupon').setTitle('Criar Cupom de Desconto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coupon_code').setLabel('Código do Cupom (ex: PROMO10)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coupon_disc').setLabel('Porcentagem de Desconto (ex: 15)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_set_role') {
      const modal = new ModalBuilder().setCustomId('modal_set_role').setTitle('Configurar Cargo da Staff');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID do Cargo que aprova pagamentos').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_edit_embed') {
      const cfg = db.data.shopEmbed;
      const modal = new ModalBuilder().setCustomId('modal_edit_embed').setTitle('Personalizar Embed da Loja');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embed_title').setLabel('Título da Embed').setValue(cfg.title).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embed_desc').setLabel('Descrição').setValue(cfg.description).setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embed_color').setLabel('Cor Hex (ex: #E02B2B)').setValue(cfg.color).setStyle(TextInputStyle.Short).setRequired(true)),
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
        .setImage(cfg.image);
      await interaction.reply({ embeds: [previewEmbed], ephemeral: true });
    }

    if (customId === 'cfg_list_prod') {
      const prods = Object.entries(db.data.products);
      if (prods.length === 0) return interaction.reply({ content: '⚠️ Nenhum produto cadastrado.', ephemeral: true });
      const list = prods.map(([id, p]) => `🔹 **ID:** \`${id}\` | **Nome:** ${p.name} | **Preço:** R$ ${p.price}`).join('\n');
      await interaction.reply({ content: `📦 **Produtos:**\n\n${list}`, ephemeral: true });
    }

    // Botão "Atendente" (Suporte)
    if (customId === 'btn_support') {
      const guild = interaction.guild;
      const supportChannel = await guild.channels.create({
        name: `suporte-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, ''),
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fechar Atendimento').setStyle(ButtonStyle.Danger)
      );

      await supportChannel.send({ 
        content: `Olá ${interaction.user}, um atendente já irá lhe ajudar em breve!`, 
        components: [row] 
      });

      await interaction.reply({ content: `✅ Canal de atendimento criado: ${supportChannel}`, ephemeral: true });
    }

    // Botão "Criar Carrinho"
    if (customId === 'btn_create_cart') {
      const products = Object.entries(db.data.products);
      if (products.length === 0) {
        return interaction.reply({ content: '⚠️ Não há produtos cadastrados no momento.', ephemeral: true });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_item_cart')
        .setPlaceholder('📦 Passo 1: Escolha o produto para o carrinho')
        .addOptions(products.map(([id, p]) => ({
          label: p.name,
          description: `Preço: R$ ${p.price}`,
          value: id
        })));

      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({ content: '🛒 **Selecione o produto que você deseja colocar no seu carrinho:**', components: [row], ephemeral: true });
    }

    if (customId === 'btn_confirm_open_ticket') {
      const session = userSessions.get(interaction.user.id);
      if (!session) {
        return interaction.reply({ content: '⚠️ Sua sessão expirou. Clique em **Criar Carrinho** novamente.', ephemeral: true });
      }

      await criarCarrinhoTicket(interaction, session.productId, session.discount, session.couponCode);
      userSessions.delete(interaction.user.id);
    }

    if (customId === 'copy_pix_key') {
      const pixValue = db.data.pix.value || 'Chave Pix não configurada.';
      await interaction.reply({ content: `📋 **Código Pix Copia e Cola:**\n\`\`\`text\n${pixValue}\n\`\`\``, ephemeral: true });
    }

    if (customId === 'notify_payment') {
      const staffRoleMention = db.data.staffRoleId ? `<@&${db.data.staffRoleId}>` : '@everyone';

      const embedNotify = new EmbedBuilder()
        .setTitle('🚨 Aguardando Validação do Pagamento')
        .setDescription(`O cliente ${interaction.user} informou que realizou o pagamento!\n\nAguardando um membro da equipe para **Confirmar Pagamento**.`)
        .setColor('#FFA500');

      const staffRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('approve_payment').setLabel('✅ Confirmar Pagamento').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Danger)
      );

      await interaction.channel.send({ content: staffRoleMention, embeds: [embedNotify], components: [staffRow] });
      await interaction.reply({ content: '✅ Notificação enviada para a equipe!', ephemeral: true });
    }

    if (customId === 'approve_payment') {
      const member = interaction.member;
      const requiredRoleId = db.data.staffRoleId;

      const hasPermission = member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                            (requiredRoleId && member.roles.cache.has(requiredRoleId));

      if (!hasPermission) {
        return interaction.reply({ content: '❌ Apenas membros autorizados da equipe podem confirmar este pagamento.', ephemeral: true });
      }

      const ticketInfo = db.data.tickets[interaction.channel.id];
      const buyerId = ticketInfo ? ticketInfo.ownerId : null;

      if (buyerId) {
        try {
          const buyer = await client.users.fetch(buyerId);
          const dmEmbed = new EmbedBuilder()
            .setTitle('🎉 Compra Aprovada!')
            .setDescription(`Seu pagamento no servidor **${interaction.guild.name}** foi confirmado com sucesso!\n\nRetorne ao seu ticket para receber o seu produto.`)
            .setColor('#00FF7F')
            .setTimestamp();
          await buyer.send({ embeds: [dmEmbed] });
        } catch (e) {}
      }

      const approvedEmbed = new EmbedBuilder()
        .setTitle('✅ Compra Aprovada com Sucesso!')
        .setDescription('**Espere seu produto ser entregue pela equipe.**')
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

  else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_item_cart') {
      const prodId = interaction.values[0];
      
      const modal = new ModalBuilder().setCustomId(`modal_coupon_cart_${prodId}`).setTitle('Passo 2: Cupom de Desconto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('coupon_input')
            .setLabel('Possui cupom? Digite-o (ou deixe em branco)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );
      await interaction.showModal(modal);
    }
  }

  else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('modal_coupon_cart_')) {
      const prodId = interaction.customId.replace('modal_coupon_cart_', '');
      const couponCode = interaction.fields.getTextInputValue('coupon_input').trim().toUpperCase();
      
      let discount = 0;
      if (couponCode) {
        const coupon = db.data.coupons[couponCode];
        if (coupon) {
          discount = parseFloat(coupon.discount);
        }
      }

      userSessions.set(interaction.user.id, {
        productId: prodId,
        discount: discount,
        couponCode: couponCode
      });

      const product = db.data.products[prodId];
      let summaryText = `📦 **Produto:** ${product.name}\n💰 **Preço:** R$ ${product.price}`;
      if (discount > 0) {
        const novoValor = parseFloat(product.price) * (1 - discount / 100);
        summaryText += `\n🎟️ **Cupom:** ${couponCode} (-${discount}%)\n💲 **Valor Final:** R$ ${novoValor.toFixed(2)}`;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_confirm_open_ticket').setLabel('🛒 Abrir e Finalizar Carrinho').setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ 
        content: `✅ **Configuração Pronta!**\n\n${summaryText}\n\nClique no botão abaixo para abrir o seu ticket privado e realizar o pagamento:`, 
        components: [row], 
        ephemeral: true 
      });
    }

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

    if (interaction.customId === 'modal_add_coupon') {
      const code = interaction.fields.getTextInputValue('coupon_code').toUpperCase();
      const discount = interaction.fields.getTextInputValue('coupon_disc');

      db.data.coupons[code] = { discount };
      db.write();
      await interaction.reply({ content: `✅ Cupom **${code}** criado com sucesso!`, ephemeral: true });
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

      await interaction.reply({ content: `✅ **Embed personalizada atualizada!**`, ephemeral: true });
    }
  }
});

async function criarCarrinhoTicket(interaction, prodId, discount = 0, couponCode = '') {
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

  db.data.tickets[ticketChannel.id] = { ownerId: interaction.user.id };
  db.write();

  const product = db.data.products[prodId];
  let finalPrice = parseFloat(product.price);
  let descText = `Você selecionou **${product.name}**.\n\n💰 **Preço Original:** \`R$ ${product.price}\``;

  if (discount > 0) {
    const valorDesconto = (finalPrice * discount) / 100;
    finalPrice = finalPrice - valorDesconto;
    descText += `\n🎟️ **Cupom Aplicado:** \`${couponCode}\` (-${discount}%)\n💰 **Novo Valor com Desconto:** \`R$ ${finalPrice.toFixed(2)}\``;
  } else if (couponCode) {
    descText += `\n❌ *Cupom \`${couponCode}\` inválido ou não encontrado.*`;
  }

  const pix = db.data.pix;
  let qrCodeAttachment = null;
  if (pix.value) {
    try {
      const buffer = await QRCode.toBuffer(pix.value);
      qrCodeAttachment = { attachment: buffer, name: 'qrcode.png' };
    } catch (e) {}
  }

  const checkoutEmbed = new EmbedBuilder()
    .setTitle(`💳 Checkout - ${product.name}`)
    .setDescription(`${descText}\n\n📲 *Escaneie o QR Code abaixo ou clique no botão para copiar a chave Pix.*`)
    .setColor('#00FF7F');

  if (qrCodeAttachment) checkoutEmbed.setImage('attachment://qrcode.png');

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('copy_pix_key').setLabel('📋 Copiar Pix').setStyle(ButtonStyle.Primary).setEmoji('🔑'),
    new ButtonBuilder().setCustomId('notify_payment').setLabel('📩 Notificar Pagamento').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('close_ticket').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({ 
    content: `Olá ${interaction.user}, aqui está o resumo do seu pedido:`, 
    embeds: [checkoutEmbed], 
    files: qrCodeAttachment ? [qrCodeAttachment] : [],
    components: [actionRow] 
  });

  await interaction.reply({ content: `✅ Seu carrinho foi criado em ${ticketChannel}!`, ephemeral: true });
}

client.login(process.env.DISCORD_TOKEN);
