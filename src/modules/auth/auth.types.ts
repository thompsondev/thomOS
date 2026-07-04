export type RegisterDto = {
  email: string;
  password: string;
  fullName?: string;
};

export type LoginDto = {
  email: string;
  password: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
  };
};
