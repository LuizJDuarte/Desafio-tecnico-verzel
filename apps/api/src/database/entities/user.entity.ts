import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { UserRole } from '@arremate/shared';

@Entity('users')
export class UserEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Sempre em minúsculas (garantido por CHECK no banco). */
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: ['BIDDER', 'AUCTIONEER'], enumName: 'user_role' })
  role: UserRole;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
