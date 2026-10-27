import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';
import type { UserRole } from '@arremate/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  /** Nome exibido apenas para o próprio usuário (publicamente ele aparece por pseudônimo). */
  @Transform(trim)
  @IsString({ message: 'Informe o nome.' })
  @Length(2, 120, { message: 'O nome deve ter entre 2 e 120 caracteres.' })
  name: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254, { message: 'E-mail muito longo.' })
  email: string;

  /** Entre 8 e 72 caracteres (72 é o limite do bcrypt). */
  @IsString({ message: 'Informe a senha.' })
  @Length(8, 72, { message: 'A senha deve ter entre 8 e 72 caracteres.' })
  password: string;

  @IsIn(['BIDDER', 'AUCTIONEER'], { message: 'Perfil inválido: use BIDDER (licitante) ou AUCTIONEER (leiloeiro).' })
  role: UserRole;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @IsString({ message: 'Informe a senha.' })
  @Length(1, 72, { message: 'Informe a senha.' })
  password: string;
}
