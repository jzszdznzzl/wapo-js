import { Bot, BotEvent, BotStore } from "./bot/index.js";
import { createSqliteStore } from "@zapo-js/store-sqlite";
import { inspect } from "node:util";

const store = new BotStore({
  backends: {
    sqlite: createSqliteStore({ path: "./state.sqlite", driver: "bun" }),
  },
  providers: {
    auth: "sqlite",
    signal: "sqlite",
    preKey: "sqlite",
    session: "sqlite",
    identity: "sqlite",
    senderKey: "sqlite",
    appState: "sqlite",
    privacyToken: "sqlite",
    messages: "sqlite",
    threads: "sqlite",
    contacts: "sqlite",
  },
});
const bot = new Bot("main", store);
bot
  .on(BotEvent.QR, async () => {
    const code = await bot.cli.auth.requestPairingCode("254771458290");
    console.log(code);
  })
  .on(BotEvent.PAIRED, () => console.dir(bot.getMe()))
  .on(BotEvent.CONNECTED, () => console.dir(bot.getMe()))
  .on(BotEvent.ERROR, console.error)
  .command(
    "eval",
    async (ctx, next) => {
      if (ctx.msg.sender?.user !== "102998399271154") {
        return;
      }
      await next();
    },
    async (ctx) => {
      const out = await eval(ctx.cmd.args.join(" "));
      const txt = inspect(out, {
        depth: 5,
        colors: false,
      });
      await ctx.msg.reply(txt);
    },
  )
  .use(async (err, ctx, _) => {
    await ctx.msg.reply(`❌ *${err.name}:* ${err.message}`);
  });
