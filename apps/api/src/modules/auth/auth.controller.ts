import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { UserDto } from '@arremate/shared';
import { CurrentUser, OptionalAuth } from './auth.decorators';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService, toUserDto } from './auth.service';
import type { AuthUser } from './auth.types';
import { TokenService } from './token.service';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cria conta de licitante (BIDDER) ou leiloeiro (AUCTIONEER) e já inicia a sessão' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response): Promise<{ user: UserDto }> {
    const user = await this.auth.register(dto);
    res.cookie(this.tokens.cookieName, this.tokens.issue(user), this.tokens.cookieOptions());
    return { user: toUserDto(user) };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Entra com e-mail e senha (sessão em cookie httpOnly)' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserDto; token: string }> {
    const user = await this.auth.login(dto.email, dto.password);
    const token = this.tokens.issue(user);
    res.cookie(this.tokens.cookieName, token, this.tokens.cookieOptions());
    // O token também volta no corpo para clientes de API (Swagger, curl, testes). O front usa o cookie.
    return { user: toUserDto(user), token };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão' })
  logout(@Res({ passthrough: true }) res: Response): void {
    const { maxAge: _maxAge, ...options } = this.tokens.cookieOptions();
    res.clearCookie(this.tokens.cookieName, options);
  }

  /** Visitante sem sessão recebe { user: null } (200), evitando erro 401 no console a cada página pública. */
  @Get('me')
  @OptionalAuth()
  @ApiOperation({ summary: 'Usuário da sessão atual (ou null para visitantes)' })
  async me(@CurrentUser() current?: AuthUser): Promise<{ user: UserDto | null }> {
    if (!current) return { user: null };
    const user = await this.auth.findById(current.id);
    return { user: user ? toUserDto(user) : null };
  }
}
