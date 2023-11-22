import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Inject,
  UnauthorizedException,
  DefaultValuePipe,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { EmailService } from 'src/email/email.service';
import { RedisService } from 'src/redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RequireLogin, UserInfo } from 'src/custom.decorator';
import { UserDetailVo } from './vo/user-info.vo';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { generateParseIntPipe } from '../utils';
import {
  ApiTags,
  ApiQuery,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LoginUserVo } from './vo/login-user.vo';
import { RefreshTokenVo } from './vo/refresh-token.vo';
import { UserListVo } from './vo/user-list.vo';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { storage } from '../my-file-storage';

@ApiTags('用户管理模块')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Inject(EmailService)
  private emailService: EmailService;

  @Inject(RedisService)
  private redisService: RedisService;

  @Inject(JwtService)
  private jwtService: JwtService;

  @Inject(ConfigService)
  private configService: ConfigService;

  // 测试数据模拟
  @Get('init')
  async init() {
    await this.userService.initData();
    return 'done';
  }

  @ApiBody({
    type: RegisterUserDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '验证码已失效/验证码不正确/用户已存在',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '注册成功/失败',
    type: String,
  })
  @Post('register')
  async register(@Body() registerUser: RegisterUserDto) {
    return await this.userService.register(registerUser);
  }

  @ApiQuery({
    name: 'address',
    type: String,
    description: '邮箱地址',
    required: true,
    example: 'xxx@xx.com',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '发送成功',
    type: String,
  })
  @Get('register-captcha')
  async captcha(@Query('address') address: string) {
    const code = Math.random().toString().slice(2, 8);

    await this.redisService.set(`captcha_${address}`, code, 5 * 60);

    await this.emailService.sendMail({
      to: address,
      subject: '注册验证码',
      html: `<p>你的注册验证码是 ${code}</p>`,
    });
    return '发送成功';
  }

  @ApiBody({
    type: LoginUserDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '用户不存在/密码错误',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '用户信息和双Token',
    type: LoginUserVo,
  })
  @Post('login')
  async userLogin(@Body() loginUser: LoginUserDto) {
    const user = await this.userService.login(loginUser, false);

    user.accessToken = this.jwtService.sign(
      {
        userId: user.userInfo.id,
        username: user.userInfo.username,
        email: user.userInfo.email,
        roles: user.userInfo.roles,
        permissions: user.userInfo.permissions,
      },
      {
        expiresIn:
          this.configService.get('jwt_access_token_expires_time') || '30m',
      },
    );

    user.refreshToken = this.jwtService.sign(
      {
        userId: user.userInfo.id,
      },
      {
        expiresIn:
          this.configService.get('jwt_refresh_token_expres_time') || '7d',
      },
    );

    return user;
  }

  @Post('admin/login')
  async adminLogin(@Body() loginUser: LoginUserDto) {
    const user = await this.userService.login(loginUser, true);
    user.accessToken = this.jwtService.sign(
      {
        userId: user.userInfo.id,
        username: user.userInfo.username,
        email: user.userInfo.email,
        roles: user.userInfo.roles,
        permissions: user.userInfo.permissions,
      },
      {
        expiresIn:
          this.configService.get('jwt_access_token_expires_time') || '30m',
      },
    );

    user.refreshToken = this.jwtService.sign(
      {
        userId: user.userInfo.id,
      },
      {
        expiresIn:
          this.configService.get('jwt_refresh_token_expres_time') || '7d',
      },
    );
    return user;
  }

  @ApiQuery({
    name: 'refreshToken',
    type: String,
    description: '刷新Token',
    required: true,
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'token已失效,请重新登录',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '刷新成功',
    type: RefreshTokenVo,
  })
  @Get('refresh')
  async refresh(@Query('refreshToken') refreshToken: string) {
    try {
      const data = this.jwtService.verify(refreshToken);
      console.log("🚀 ~ file: user.controller.ts:202 ~ UserController ~ refresh ~ data:", data)

      const user = await this.userService.findUserById(data.userId, false);

      const access_token = this.jwtService.sign(
        {
          userId: user.id,
          username: user.username,
          roles: user.roles,
          email: user.email,
          permissions: user.permissions,
        },
        {
          expiresIn:
            this.configService.get('jwt_access_token_expires_time') || '30m',
        },
      );

      const refresh_token = this.jwtService.sign(
        {
          userId: user.id,
        },
        {
          expiresIn:
            this.configService.get('jwt_refresh_token_expres_time') || '7d',
        },
      );

      const vo = new RefreshTokenVo();
      vo.access_token = access_token;
      vo.refresh_token = refresh_token;
      return vo;
    } catch (e) {
      throw new UnauthorizedException('token 已失效，请重新登录');
    }
  }

  @Get('admin/refresh')
  async adminRefresh(@Query('refreshToken') refreshToken: string) {
    try {
      const data = this.jwtService.verify(refreshToken);

      const user = await this.userService.findUserById(data.userId, true);

      const access_token = this.jwtService.sign(
        {
          userId: user.id,
          username: user.username,
          roles: user.roles,
          email: user.email,
          permissions: user.permissions,
        },
        {
          expiresIn:
            this.configService.get('jwt_access_token_expires_time') || '30m',
        },
      );

      const refresh_token = this.jwtService.sign(
        {
          userId: user.id,
        },
        {
          expiresIn:
            this.configService.get('jwt_refresh_token_expres_time') || '7d',
        },
      );

      return {
        access_token,
        refresh_token,
      };
    } catch (e) {
      throw new UnauthorizedException('token 已失效，请重新登录');
    }
  }

  @ApiBearerAuth()
  @ApiQuery({
    name: 'userId',
    type: Number,
    description: '用户id',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取用户信息成功',
    type: UserDetailVo,
  })
  @Get('info')
  @RequireLogin()
  async info(@UserInfo('userId') userId: number) {
    const user = await this.userService.findUserDetailById(userId);
    const vo = new UserDetailVo();
    vo.id = user.id;
    vo.email = user.email;
    vo.username = user.username;
    vo.headPic = user.headPic;
    vo.phoneNumber = user.phoneNumber;
    vo.nickName = user.nickName;
    vo.createTime = user.createTime;
    vo.isFrozen = user.isFrozen;
    return vo;
  }

  // @ApiBearerAuth()
  @ApiBody({
    type: UpdateUserPasswordDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '验证码已失效/验证码不正确',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '密码修改成功/失败',
    type: String,
  })
  @Post(['update_password', 'admin/update_password'])
  // @RequireLogin()
  async updatePassword(@Body() passwordDto: UpdateUserPasswordDto) {
    return await this.userService.updatePassword(passwordDto);
  }

  // @ApiBearerAuth()
  @ApiQuery({
    name: 'address',
    type: String,
    description: '接收更改密码验证码邮箱地址',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '发送成功',
    type: String,
  })
  // @RequireLogin()
  @Get('update_password/captcha')
  async updatePasswordCaptcha(@Query('address') address: string) {
    const code = Math.random().toString().slice(2, 8);

    await this.redisService.set(
      `update_password_captcha_${address}`,
      code,
      10 * 60,
    );

    await this.emailService.sendMail({
      to: address,
      subject: '更改密码验证码',
      html: `<p>你的更改密码验证码是 ${code}</p>`,
    });
    return '发送成功';
  }

  @ApiBearerAuth()
  @ApiBody({
    type: UpdateUserDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '验证码已失效/验证码不正确',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '用户信息修改成功/失败',
  })
  @Post(['update', 'admin/update'])
  @RequireLogin()
  async update(
    @UserInfo('userId') userId: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return await this.userService.update(userId, updateUserDto);
  }

  @RequireLogin()
  @Get('update/captcha')
  async updateCaptcha(@UserInfo('email') address: string) {
    const code = Math.random().toString().slice(2, 8);

    await this.redisService.set(
      `update_user_captcha_${address}`,
      code,
      10 * 60,
    );

    await this.emailService.sendMail({
      to: address,
      subject: '更改用户信息验证码',
      html: `<p>你的验证码是 ${code}</p>`,
    });
    return '发送成功';
  }

  @ApiBearerAuth()
  @ApiQuery({
    name: 'id',
    type: Number,
    description: '用户id',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'success',
  })
  @Get('freeze')
  @RequireLogin()
  async freeze(@Query('id') userId: number) {
    await this.userService.freezeUserById(userId);
    return 'success';
  }

  @ApiBearerAuth()
  @ApiQuery({
    name: 'pageNo',
    description: '页码',
    type: Number,
  })
  @ApiQuery({
    name: 'pageSize',
    description: '页大小',
    type: Number,
  })
  @ApiQuery({
    name: 'username',
    description: '用户名',
    type: String,
  })
  @ApiQuery({
    name: 'nickName',
    description: '昵称',
    type: String,
  })
  @ApiQuery({
    name: 'email',
    description: '邮箱地址',
    type: String,
  })
  @ApiResponse({
    type: UserListVo,
    description: '用户列表',
  })
  @Get('list')
  @RequireLogin()
  async list(
    @Query('pageNo', new DefaultValuePipe(1), generateParseIntPipe('pageNo'))
    pageNo: number,
    @Query(
      'pageSize',
      new DefaultValuePipe(2),
      generateParseIntPipe('pageSize'),
    )
    pageSize: number,
    @Query('username') username: string,
    @Query('nickName') nickName: string,
    @Query('email') email: string,
  ) {
    return await this.userService.findUsers(
      username,
      nickName,
      email,
      pageNo,
      pageSize,
    );
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: 'uploads',
      storage: storage,
      limits: {
        fileSize: 1024 * 1024 * 3,
      },
      fileFilter(req, file, callback) {
        const extname = path.extname(file.originalname);
        if (['.png', '.jpg', '.gif'].includes(extname)) {
          callback(null, true);
        } else {
          callback(new BadRequestException('只能上传图片'), false);
        }
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    console.log('file', file);
    return file.path;
  }
}
