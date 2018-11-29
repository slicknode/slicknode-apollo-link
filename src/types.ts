/**
 * Interface for custom storage
 */
export interface IStorage {
  getItem(keyName: string): string | null;
  setItem(keyName: string, keyValue: string): void;
  removeItem(keyName: string): void;
  clear(): void;
}

export interface IAuthTokenSet {
  accessToken: string;
  accessTokenLifetime: number;
  refreshToken: string;
  refreshTokenLifetime: number;
}

export interface ISlicknodeLinkOptions {
  /**
   * The storage interface to store auth tokens, default is localStorage
   */
  storage?: Storage;

  /**
   * The namespace under which auth tokens are stored in the storage
   */
  namespace?: string;

  /**
   * Use a permanent access token for authentication
   */
  accessToken?: string;

  /**
   * Write debug information to console
   */
  debug?: boolean;
}
