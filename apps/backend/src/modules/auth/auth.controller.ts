import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { StudentRegisterDto } from './dto/student-register.dto';
import { TrainerRegisterDto } from './dto/trainer-register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Universal Login (Students, Trainers, Admins)' })
  @ApiResponse({ status: 200, description: 'User authenticated successfully' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('register/student')
  @ApiOperation({ summary: 'Register a new student with optional class code' })
  async registerStudent(@Body() dto: StudentRegisterDto) {
    return this.authService.registerStudent(dto);
  }

  @Public()
  @Post('register/trainer')
  @ApiOperation({ summary: 'Submit a trainer application (awaits admin approval)' })
  async registerTrainer(@Body() dto: TrainerRegisterDto) {
    return this.authService.registerTrainer(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP for password reset or initial activation' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and set a new password' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
