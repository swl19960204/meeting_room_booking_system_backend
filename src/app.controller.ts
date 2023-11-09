import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RequireLogin, RequirePermission, UserInfo } from './custom.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('aaa')
  // @SetMetadata('require-login', true)
  @RequireLogin()
  // @SetMetadata('require-permission', ['ddd'])
  @RequirePermission('ccc')
  aaaa(@UserInfo('username') username: string, @UserInfo() userInfo) {
    console.log(
      '🚀 ~ file: app.controller.ts:20 ~ AppController ~ aaaa ~ userInfo:',
      userInfo,
    );
    console.log(
      '🚀 ~ file: app.controller.ts:20 ~ AppController ~ aaaa ~ username:',
      username,
    );
    return 'aaa';
  }

  @Get('bbb')
  bbb() {
    return 'bbb';
  }
}
