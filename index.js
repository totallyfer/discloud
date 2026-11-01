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
    .setDescription('Painel de configuração da loja (Admin/Moderadores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('Gerenciar itens, cupons e Pix da loja')
    ),
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Envia o painel de compras da loja em um canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('Envia o painel de atendimento e vendas')
        .addChannelOption(option =>
          option.setName('canal').setDescription('Canal onde o painel será enviado').setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`Bot logado como ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Comandos slash (/config e /start) registrados com sucesso.');
  } catch (error) {
    console.error(error);
  }
});

// Interação de Comandos
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    if (commandName === 'config') {
      const sub = options.getSubcommand();
      if (sub === 'shop') {
        const embed = new EmbedBuilder()
          .setTitle('🛒 Painel de Configuração da Loja')
          .setDescription('Gerencie produtos, cupons e dados de pagamento Pix abaixo.')
          .setColor('#8A2BE2'); // Roxo Neon

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg_add_prod').setLabel('➕ Adicionar Produto').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('cfg_list_prod').setLabel('📦 Ver Produtos').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('cfg_pix').setLabel('💳 Configurar Pix').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cfg_coupon').setLabel('🎟️ Criar Cupom').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }
    }

    if (commandName === 'start') {
      const sub = options.getSubcommand();
      if (sub === 'shop') {
        const channel = options.getChannel('canal');
        db.data.shopChannel = channel.id;
        await db.write();

        const shopEmbed = new EmbedBuilder()
          .setTitle('🛍️ Central de Atendimento & Vendas')
          .setDescription('Seja bem-vindo à nossa loja! Clique no botão abaixo para abrir seu **Ticket de Atendimento** e adquirir nossos produtos.')
          .setColor('#9D00FF')
          .setFooter({ text: 'Sistema de Vendas Automatizado' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket').setLabel('🛒 Abrir Carrinho / Comprar').setStyle(ButtonStyle.Success).setEmoji('💳')
        );

        await channel.send({ embeds: [shopEmbed], components: [row] });
        await interaction.reply({ content: `Painel da loja enviado com sucesso para ${channel}!`, ephemeral: true });
      }
    }
  }

  // Interações de Botões e Menus
  else if (interaction.isButton()) {
    if (interaction.customId === 'cfg_add_prod') {
      const modal = new ModalBuilder().setCustomId('modal_add_prod').setTitle('Cadastrar Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('ID do Produto (ex: vip1)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_name').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_price').setLabel('Preço (Apenas números, ex: 15.00)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'cfg_pix') {
      const modal = new ModalBuilder().setCustomId('modal_set_pix').setTitle('Configurar Pix');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix_type').setLabel('Tipo (Chave ou CopiaECola)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix_val').setLabel('Chave Pix ou Código Copia e Cola').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'cfg_list_prod') {
      await db.read();
      const prods = Object.entries(db.data.products);
      if (prods.length === 0) return interaction.reply({ content: 'Nenhum produto cadastrado.', ephemeral: true });
      
      const list = prods.map(([id, p]) => `**ID:** \`${id}\` | **Nome:** ${p.name} | **Preço:** R$ ${p.price}`).join('\n');
      await interaction.reply({ content: `📦 **Produtos Cadastrados:**\n\n${list}`, ephemeral: true });
    }

    if (interaction.customId === 'open_ticket') {
      const guild = interaction.guild;
      const channelName = `carrinho-${interaction.user.username}`.toLowerCase();
      
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      await db.read();
      const products = Object.entries(db.data.products);
      
      if (products.length === 0) {
        await ticketChannel.send({ content: `${interaction.user}, o carrinho foi aberto, mas não há produtos cadastrados no momento.` });
        return interaction.reply({ content: `Seu carrinho foi aberto em ${ticketChannel}!`, ephemeral: true });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_product')
        .setPlaceholder('Selecione um produto para comprar')
        .addOptions(products.map(([id, p]) => ({
          label: p.name,
          description: `Preço: R$ ${p.price}`,
          value: id
        })));

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      await ticketChannel.send({ 
        content: `Olá ${interaction.user}, bem-vindo ao seu carrinho! Selecione o produto desejado abaixo:`, 
        components: [row] 
      });

      await interaction.reply({ content: `Carrinho criado com sucesso: ${ticketChannel}`, ephemeral: true });
    }
  }

  // Tratamento de Select Menus (Escolha do Produto)
  else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_product') {
      await db.read();
      const prodId = interaction.values[0];
      const product = db.data.products[prodId];
      const pix = db.data.pix;

      if (!product) return interaction.reply({ content: 'Produto não encontrado.', ephemeral: true });

      let qrCodeAttachment = null;
      let pixText = pix.value || 'Pix não configurado pelo administrador.';

      if (pix.type.toLowerCase().includes('copia') || pix.val || pix.value.length > 30) {
        try {
          const buffer = await QRCode.toBuffer(pix.value);
          qrCodeAttachment = { attachment: buffer, name: 'qrcode.png' };
        } catch (e) {
          console.error(e);
        }
      }

      const checkoutEmbed = new EmbedBuilder()
        .setTitle(`💳 Pagamento - ${product.name}`)
        .setDescription(`Você selecionou **${product.name}**.\n**Preço:** R$ ${product.price}\n\n**Instruções de Pagamento (Pix):**\n\`${pixText}\``)
        .setColor('#00FF7F'); // Verde Mentha

      if (qrCodeAttachment) checkoutEmbed.setImage('attachment://qrcode.png');

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('finish_payment').setLabel('✅ Já fiz o pagamento').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('❌ Fechar Carrinho').setStyle(ButtonStyle.Danger)
      );

      await interaction.update({ 
        content: 'Produto selecionado com sucesso! Realize o pagamento via Pix abaixo:', 
        embeds: [checkoutEmbed], 
        files: qrCodeAttachment ? [qrCodeAttachment] : [],
        components: [actionRow] 
      });
    }
  }

  // Fechar ticket / finalizar pagamento
  else if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'Fechando este canal em 5 segundos...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  else if (interaction.isButton() && interaction.customId === 'finish_payment') {
    await interaction.reply({ content: '⚠️ Pagamento enviado para validação da staff! Em breve seu produto será entregue.' });
  }

  // Resposta dos Modais (Cadastros)
  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_add_prod') {
      const id = interaction.fields.getTextInputValue('prod_id');
      const name = interaction.fields.getTextInputValue('prod_name');
      const price = interaction.fields.getTextInputValue('prod_price');
      const desc = interaction.fields.getTextInputValue('prod_desc');

      await db.read();
      db.data.products[id] = { name, price, desc };
      await db.write();

      await interaction.reply({ content: `✅ Produto **${name}** cadastrado com sucesso!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_set_pix') {
      const type = interaction.fields.getTextInputValue('pix_type');
      const value = interaction.fields.getTextInputValue('pix_val');

      await db.read();
      db.data.pix = { type, value };
      await db.write();

      await interaction.reply({ content: `✅ Informações do Pix salvas com sucesso!`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
