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

// Comandos Slash Avançados
const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Painel avançado de configuração da loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('Gerencia produtos, cupons, Pix e cargos do sistema de vendas')
    ),
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Envia o painel profissional de atendimento e vendas')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('Envia o painel avançado em um canal específico')
        .addChannelOption(option =>
          option.setName('canal').setDescription('Canal onde o painel será enviado').setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag} (Sistema Avançado)`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Comandos avançados registrados com sucesso.');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async interaction => {
  db.read();

  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    if (commandName === 'config') {
      if (options.getSubcommand() === 'shop') {
        const embed = new EmbedBuilder()
          .setTitle('⚙️ Painel de Controle Avançado da Loja')
          .setDescription('Gerencie todos os parâmetros da sua loja virtual através dos botões abaixo:')
          .addFields(
            { name: '📦 Produtos Ativos', value: `${Object.keys(db.data.products).length} cadastrados`, inline: true },
            { name: '🎟️ Cupons Disponíveis', value: `${Object.keys(db.data.coupons).length} ativos`, inline: true },
            { name: '💳 Status do Pix', value: db.data.pix.value ? 'Configurado ✅' : 'Não configurado ❌', inline: true }
          )
          .setColor('#8A2BE2');

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_add_prod').setLabel('➕ Adicionar Produto').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_del_prod').setLabel('🗑️ Remover Produto').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cfg_list_prod').setLabel('📦 Listar Produtos').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_pix').setLabel('💳 Configurar Pix').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cfg_coupon').setLabel('🎟️ Criar Cupom').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_list_coupons').setLabel('📋 Ver Cupons').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
      }
    }

    if (commandName === 'start') {
      if (options.getSubcommand() === 'shop') {
        const channel = options.getChannel('canal');
        db.data.shopChannel = channel.id;
        db.write();

        const shopEmbed = new EmbedBuilder()
          .setTitle('🛒 Central de Atendimento & Vendas - Loja Oficial')
          .setDescription('Seja muito bem-vindo(a) à nossa central de vendas automatizada!\n\n' +
                          '✨ **Como comprar?**\n' +
                          '1️⃣ Clique no botão **"🛒 Abrir Carrinho"** abaixo.\n' +
                          '2️⃣ Selecione os produtos desejados no seu canal privado.\n' +
                          '3️⃣ Insira cupons de desconto (se tiver) e realize o pagamento via Pix.\n\n' +
                          '🔒 *Atendimento rápido, seguro e automatizado.*')
          .setColor('#9D00FF')
          .setImage('https://images.unsplash.com/photo-1607532940433-1d604d1efc91?w=800&auto=format&fit=crop&q=60') // Imagem ilustrativa elegante de loja
          .setFooter({ text: 'Sistema de Vendas • Todos os direitos reservados' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket').setLabel('🛒 Abrir Carrinho / Comprar').setStyle(ButtonStyle.Success).setEmoji('💳'),
          new ButtonBuilder().setCustomId('faq_rules').setLabel('📄 Termos e Regras').setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ embeds: [shopEmbed], components: [row] });
        await interaction.reply({ content: `✅ Painel avançado de vendas enviado com sucesso para ${channel}!`, ephemeral: true });
      }
    }
  }

  // --- BOTÕES DE CONFIGURAÇÃO E INTERAÇÃO ---
  else if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId === 'cfg_add_prod') {
      const modal = new ModalBuilder().setCustomId('modal_add_prod').setTitle('Cadastrar Novo Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('ID Único (ex: rank_vip)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_name').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_price').setLabel('Preço (Apenas números, ex: 25.90)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_desc').setLabel('Descrição Detalhada').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_pix') {
      const modal = new ModalBuilder().setCustomId('modal_set_pix').setTitle('Configurar Pagamento Pix');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix_type').setLabel('Tipo (Chave CPF, CNPJ, Email, Tel)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix_val').setLabel('Chave Pix ou Código Copia e Cola').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_coupon') {
      const modal = new ModalBuilder().setCustomId('modal_add_coupon').setTitle('Criar Cupom de Desconto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coupon_code').setLabel('Código do Cupom (ex: DESCONTO10)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coupon_disc').setLabel('Porcentagem de Desconto (ex: 15 para 15%)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'cfg_list_prod') {
      const prods = Object.entries(db.data.products);
      if (prods.length === 0) return interaction.reply({ content: '⚠️ Nenhum produto cadastrado no momento.', ephemeral: true });
      
      const list = prods.map(([id, p]) => `🔹 **ID:** \`${id}\` | **Nome:** ${p.name} | **Preço:** R$ ${p.price}\n*${p.desc}*`).join('\n\n');
      await interaction.reply({ content: `📦 **Lista de Produtos Ativos:**\n\n${list}`, ephemeral: true });
    }

    if (customId === 'cfg_list_coupons') {
      const coupons = Object.entries(db.data.coupons);
      if (coupons.length === 0) return interaction.reply({ content: '⚠️ Nenhum cupom cadastrado.', ephemeral: true });
      
      const list = coupons.map(([code, c]) => `🎟️ **Cupom:** \`${code}\` | **Desconto:** ${c.discount}%`).join('\n');
      await interaction.reply({ content: `📋 **Cupons Ativos:**\n\n${list}`, ephemeral: true });
    }

    if (customId === 'faq_rules') {
      await interaction.reply({ 
        content: '📜 **Termos da Loja:**\n1. Após o pagamento via Pix, envie o comprovante no canal do carrinho.\n2. O prazo de entrega pode variar de minutos a 24 horas úteis.\n3. Reembolsos apenas mediante análise prévia da administração.', 
        ephemeral: true 
      });
    }

    // --- ABRIR CARRINHO (TICKET) ---
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

      const products = Object.entries(db.data.products);
      
      if (products.length === 0) {
        await ticketChannel.send({ content: `${interaction.user}, seu carrinho foi aberto, mas infelizmente não há produtos cadastrados no momento.` });
        return interaction.reply({ content: `✅ Carrinho criado com sucesso: ${ticketChannel}`, ephemeral: true });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_product')
        .setPlaceholder('🛒 Selecione o produto que deseja adquirir')
        .addOptions(products.map(([id, p]) => ({
          label: p.name,
          description: `Preço: R$ ${p.price} - ${p.desc.substring(0, 50)}`,
          value: id
        })));

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`🛒 Carrinho de Compras - ${interaction.user.username}`)
        .setDescription('Selecione abaixo o produto que você deseja comprar para prosseguir com o pagamento.')
        .setColor('#8A2BE2');

      await ticketChannel.send({ 
        content: `Olá ${interaction.user}, este é o seu canal de atendimento exclusivo!`, 
        embeds: [welcomeEmbed], 
        components: [row] 
      });

      await interaction.reply({ content: `✅ Carrinho criado com sucesso: ${ticketChannel}`, ephemeral: true });
    }

    // Ações dentro do Carrinho
    if (customId === 'close_ticket') {
      await interaction.reply({ content: '🔒 Fechando este carrinho em 5 segundos...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (customId === 'apply_coupon_modal') {
      const modal = new ModalBuilder().setCustomId('modal_apply_coupon').setTitle('Aplicar Cupom de Desconto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coupon_code_input').setLabel('Digite o código do cupom').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (customId === 'finish_payment') {
      const embedStaff = new EmbedBuilder()
        .setTitle('🚨 Novo Pagamento Informado!')
        .setDescription(`O cliente ${interaction.user} informou que realizou o pagamento via Pix.\nVerifique o extrato bancário e entregue o produto.`)
        .setColor('#FFA500')
        .setTimestamp();

      const staffRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('approve_payment').setLabel('✅ Aprovar e Entregar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fechar Canal').setStyle(ButtonStyle.Danger)
      );

      await interaction.channel.send({ embeds: [embedStaff], components: [staffRow] });
      await interaction.reply({ content: '✅ Comprovante enviado para a equipe! Aguarde a validação.', ephemeral: true });
    }

    if (customId === 'approve_payment') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Apenas administradores/moderadores podem aprovar pagamentos.', ephemeral: true });
      }
      await interaction.update({ content: '✅ **Pagamento Aprovado com Sucesso!** O pedido foi finalizado.', embeds: [], components: [] });
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
      let pixValue = pix.value || 'Pix não configurado pelo administrador.';

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
                        `💰 **Valor a Pagar:** \`R$ ${product.price}\`\n\n` +
                        `📲 **Dados para Pagamento (Pix):**\n\`\`\`text\n${pixValue}\n\`\`\`\n` +
                        `*Escaneie o QR Code abaixo ou utilize a chave Pix Copia e Cola.*`)
        .setColor('#00FF7F');

      if (qrCodeAttachment) checkoutEmbed.setImage('attachment://qrcode.png');

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('finish_payment').setLabel('✅ Já fiz o pagamento').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('apply_coupon_modal').setLabel('🎟️ Inserir Cupom').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ 
        content: '🛒 **Produto selecionado!** Realize o pagamento via Pix abaixo:', 
        embeds: [checkoutEmbed], 
        files: qrCodeAttachment ? [qrCodeAttachment] : [],
        components: [actionRow] 
      });
    }
  }

  // --- CADASTROS VIA MODAL ---
  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_add_prod') {
      const id = interaction.fields.getTextInputValue('prod_id').toLowerCase();
      const name = interaction.fields.getTextInputValue('prod_name');
      const price = interaction.fields.getTextInputValue('prod_price');
      const desc = interaction.fields.getTextInputValue('prod_desc');

      db.data.products[id] = { name, price, desc };
      db.write();

      await interaction.reply({ content: `✅ Produto **${name}** (\`${id}\`) cadastrado com sucesso!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_set_pix') {
      const type = interaction.fields.getTextInputValue('pix_type');
      const value = interaction.fields.getTextInputValue('pix_val');

      db.data.pix = { type, value };
      db.write();

      await interaction.reply({ content: `✅ Chave/QR Code Pix configurado com sucesso!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_add_coupon') {
      const code = interaction.fields.getTextInputValue('coupon_code').toUpperCase();
      const discount = interaction.fields.getTextInputValue('coupon_disc');

      db.data.coupons[code] = { discount };
      db.write();

      await interaction.reply({ content: `✅ Cupom **${code}** (${discount}% de desconto) criado com sucesso!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_apply_coupon') {
      const code = interaction.fields.getTextInputValue('coupon_code_input').toUpperCase();
      const coupon = db.data.coupons[code];

      if (!coupon) {
        return interaction.reply({ content: '❌ Cupom inválido ou expirado.', ephemeral: true });
      }

      await interaction.reply({ content: `🎉 Cupom **${code}** aplicado com sucesso! **${coupon.discount}% de desconto** concedido. (Apresente este valor com desconto ao efetuar o Pix).`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
