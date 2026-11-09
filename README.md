# Pedido de Velas

App para celular para montar pedidos de velas: cada cor tem um campo de quantidade para **Velas Palito** e **Velas 7 Dias**.

## Funções
- Lista de cores com quantidade para Palito e 7 Dias (o pedido em andamento fica salvo no celular).
- Campos opcionais: nome do pedido (ex.: "Festa de Ogum"), cliente/terreiro e observações.
- **Financeiro** (opcional) em cada pedido: KG de palito, valor pago no palito e valor pago nas 7 Dias. O app calcula o R$/kg, o R$ por vela 7 Dias e o valor total.
- Adicionar cores, editar o nome (✎) ou remover (✕) qualquer cor. O link "Restaurar cores padrão" volta à lista original.
- **Texto**: abre uma caixa com o pedido pronto para copiar e colar no WhatsApp.
- **PDF**: as duas tabelas lado a lado, só com as cores preenchidas, com totais.
- **Excel**: aba `Palito` e aba `7 Dias`, com totais.
- **Guardar**: salva o pedido no **Histórico** e começa um novo.
- **Histórico**: busca por nome, cliente, data ou cor; ver cada pedido, **editar**, exportar de novo (Texto/PDF/Excel), repetir ou excluir. Excel com todos os pedidos (incluindo o financeiro), backup e restauração.
- **Estatísticas**: total de pedidos e velas, gasto total, gasto com palito e com 7 Dias, KG comprados, preço médio do kg e da vela 7 Dias, gasto por mês, pedidos por mês, velas por mês e cores mais pedidas, com filtro de período.
- **Login com usuário e senha**: todos usam o mesmo link, e **cada usuário vê apenas os próprios pedidos**, estatísticas e lista de cores, de qualquer celular em que entrar.
- Pedidos ficam no banco (Railway + Postgres). Sem internet, o pedido guardado fica pendente e é enviado quando a conexão voltar.
- Instalável na tela inicial e funciona offline.

## Usuários
- O **primeiro administrador** é criado pelas variáveis `ADMIN_USUARIO` e `ADMIN_SENHA` (só na primeira vez; depois a senha é trocada pelo app).
- O administrador toca no **círculo com a inicial** (canto superior direito) → **Usuários** para criar usuários, trocar a senha de alguém ou excluir um usuário (os pedidos dele são apagados junto).
- Qualquer usuário pode trocar a própria senha e **Sair** pelo mesmo menu. Ao sair, os dados dele são apagados do celular (continuam no servidor).
- Usuário para login: 3 a 40 letras minúsculas, números, ponto, hífen ou `_`. Senha: mínimo 6 caracteres.
- Pedidos que existiam antes do login ficam com o primeiro administrador.

## Estrutura
```
server.js      servidor Node (Express) + API /api ligada ao Postgres
public/        o app (HTML, CSS, JS) servido pelo servidor
package.json   dependências (express, pg) e o comando "npm start"
```
As tabelas do banco (`usuarios`, `sessoes`, `pedidos` e `config`) são criadas automaticamente na primeira vez que o servidor sobe.

## Publicar no Railway
1. Em [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** → escolha `feperroni/appvelas`.
2. No mesmo projeto: **+ Create → Database → PostgreSQL**.
3. Abra o serviço do app → aba **Variables** e adicione:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência ao banco criado no passo 2)
   - `ADMIN_USUARIO` = seu login de administrador, por exemplo `admin`
   - `ADMIN_SENHA` = uma senha forte para esse administrador
4. Aba **Settings → Networking → Generate Domain** para ganhar o link público (`https://....up.railway.app`).
5. Abra o link no celular, entre com o administrador e crie os outros usuários em **Usuários**.

O Railway detecta o Node sozinho e roda `npm start`. A cada `git push` na `main` ele publica a nova versão.

### Já usava o app só no celular?
Os pedidos que já estavam guardados no celular são enviados para a conta do primeiro usuário que entrar nele pelo link do Railway (**precisa ser o mesmo navegador** onde eles estavam). Se for outro aparelho/link, use **Fazer backup** no app antigo e **Restaurar backup** no novo.

## Variáveis de ambiente
| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | conexão do Postgres |
| `ADMIN_USUARIO` | sim, na primeira vez | login do primeiro administrador |
| `ADMIN_SENHA` | sim, na primeira vez | senha inicial desse administrador |
| `PGSSL` | não | `true` para usar SSL (só se usar a URL pública do banco) |
| `PORT` | não | o Railway define sozinho |

## Rodar no computador
```bash
npm install
DATABASE_URL=postgres://usuario:senha@localhost:5432/velas ADMIN_USUARIO=admin ADMIN_SENHA=troque-esta-senha npm start
```
Depois abra `http://localhost:3000`.

## Instalar no celular
- **Android (Chrome)**: abra o link → menu ⋮ → *Adicionar à tela inicial / Instalar app*.
- **iPhone (Safari)**: abra o link → botão Compartilhar → *Adicionar à Tela de Início*.

## Mudar a lista padrão de cores
Edite `CORES_PADRAO` no topo de `public/app.js`. (Com o servidor, a lista usada é a que está no banco; o link "Restaurar cores padrão" aplica a lista do código.)
Ao alterar arquivos de `public/`, troque também a versão em `public/sw.js` (`pedido-velas-v7` → `v8`) para os celulares pegarem a atualização.
