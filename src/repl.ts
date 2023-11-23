import { repl } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // await repl(AppModule);
  const replServer = await repl(AppModule);
  replServer.setupHistory(".nestjs_repl_history", (err) => {
      if (err) {
          console.error(err);
      }
  });
}
bootstrap();
