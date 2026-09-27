export interface UserRecord {
  id: string;
  email: string;
  name: string;
  timezone: string;
  currency: string;
  createdAt: Date;
}

export interface UserWithPassword extends UserRecord {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  timezone?: string;
}
