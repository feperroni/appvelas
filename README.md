# Pedido de Velas

App para celular para montar pedidos de velas: cada cor tem um campo de quantidade para **Velas Palito** e **Velas 7 Dias**.

## Funções
- Lista de cores com quantidade para Palito e 7 Dias (salva automaticamente no celular).
- Campo opcional de cliente/terreiro e observações.
- Adicionar cores, editar o nome (✎) ou remover (✕) qualquer cor. O link "Restaurar cores padrão" volta à lista original.
- **PDF**: as duas tabelas lado a lado, só com as cores preenchidas, com totais.
- **Excel**: aba `Palito` e aba `7 Dias`, com totais.
- **Guardar**: salva o pedido no **Histórico** e começa um novo.
- **Histórico**: ver cada pedido, exportar de novo (PDF/Excel), repetir ou excluir. Excel com todos os pedidos, backup e restauração.
- **Estatísticas**: total de pedidos e velas, média por pedido, pedidos por mês, velas por mês (Palito × 7 Dias) e cores mais pedidas, com filtro de período.
- Os dados ficam guardados no próprio celular (não são compartilhados entre aparelhos). Use o backup para não perder.
- No celular, o botão de exportar abre o menu de compartilhar (WhatsApp, e-mail, Drive...).
- Funciona offline depois do primeiro acesso e pode ser instalado na tela inicial.

## Como publicar (GitHub Pages)
1. No GitHub: **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve.
3. Em ~1 minuto o app fica em `https://feperroni.github.io/appvelas/`.

## Como instalar no celular
- **Android (Chrome)**: abra o link → menu ⋮ → *Adicionar à tela inicial / Instalar app*.
- **iPhone (Safari)**: abra o link → botão Compartilhar → *Adicionar à Tela de Início*.

## Mudar a lista de cores
Edite a lista `CORES_PADRAO` no topo do arquivo `app.js`.
Ao alterar arquivos, troque também a versão em `sw.js` (`pedido-velas-v1` → `v2`) para os celulares pegarem a atualização.
