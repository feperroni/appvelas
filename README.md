# Pedido de Velas

App para celular para montar pedidos de velas: cada cor tem um campo de quantidade para **Velas Palito** e **Velas 7 Dias**.

## Funções
- Lista de cores com quantidade para Palito e 7 Dias (o pedido em andamento fica salvo no celular).
- Campo opcional de cliente/terreiro e observações.
- Adicionar cores, editar o nome (✎) ou remover (✕) qualquer cor. O link "Restaurar cores padrão" volta à lista original.
- **Texto**: abre uma caixa com o pedido pronto para copiar e colar no WhatsApp.
- **PDF**: as duas tabelas lado a lado, só com as cores preenchidas, com totais.
- **Excel**: aba `Palito` e aba `7 Dias`, com totais.
- **Guardar**: salva o pedido no **Histórico** e começa um novo.
- **Histórico**: ver cada pedido, exportar de novo (Texto/PDF/Excel), repetir ou excluir. Excel com todos os pedidos, backup e restauração.
- **Estatísticas**: total de pedidos e velas, média por pedido, pedidos por mês, velas por mês (Palito × 7 Dias) e cores mais pedidas, com filtro de período.
- Com o servidor (Railway + Postgres), **pedidos e lista de cores ficam no banco e são compartilhados entre os celulares**. Sem internet, o pedido guardado fica pendente e é enviado quando a conexão voltar.
- Instalável na tela inicial e funciona offline.

## Estrutura
```
server.js      servidor Node (Express) + API /api ligada ao Postgres
public/        o app (HTML, CSS, JS) servido pelo servidor
package.json   dependências (express, pg) e o comando "npm start"
```
As tabelas do banco (`pedidos` e `config`) são criadas automaticamente na primeira vez que o servidor sobe.

## Publicar no Railway
1. Em [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** → escolha `feperroni/appvelas`.
2. No mesmo projeto: **+ Create → Database → PostgreSQL**.
3. Abra o serviço do app → aba **Variables** e adicione:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência ao banco criado no passo 2)
   - `APP_PIN` = um código de acesso, por exemplo `4821` (recomendado: sem ele, qualquer pessoa com o link vê e apaga pedidos)
4. Aba **Settings → Networking → Generate Domain** para ganhar o link público (`https://....up.railway.app`).
5. Abra o link no celular, digite o código de acesso uma vez e instale na tela inicial.

O Railway detecta o Node sozinho e roda `npm start`. A cada `git push` na `main` ele publica a nova versão.

### Já usava o app só no celular?
Os pedidos que já estavam guardados no celular são enviados ao banco automaticamente na primeira vez que o app abrir pelo link do Railway (**precisa ser o mesmo navegador** onde eles estavam). Se for outro aparelho/link, use **Fazer backup** no app antigo e **Restaurar backup** no novo.

## Variáveis de ambiente
| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | conexão do Postgres |
| `APP_PIN` | não (recomendado) | código de acesso pedido pelo app |
| `PGSSL` | não | `true` para usar SSL (só se usar a URL pública do banco) |
| `PORT` | não | o Railway define sozinho |

## Rodar no computador
```bash
npm install
DATABASE_URL=postgres://usuario:senha@localhost:5432/velas npm start
```
Depois abra `http://localhost:3000`.

## Instalar no celular
- **Android (Chrome)**: abra o link → menu ⋮ → *Adicionar à tela inicial / Instalar app*.
- **iPhone (Safari)**: abra o link → botão Compartilhar → *Adicionar à Tela de Início*.

## Mudar a lista padrão de cores
Edite `CORES_PADRAO` no topo de `public/app.js`. (Com o servidor, a lista usada é a que está no banco; o link "Restaurar cores padrão" aplica a lista do código.)
Ao alterar arquivos de `public/`, troque também a versão em `public/sw.js` (`pedido-velas-v5` → `v6`) para os celulares pegarem a atualização.
