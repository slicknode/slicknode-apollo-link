import {ApolloLink, createOperation, FetchResult, NextLink, Observable, Operation} from 'apollo-link';
import gql from 'graphql-tag';
import MemoryStorage from './storage/MemoryStorage';
import {IAuthTokenSet, ISlicknodeLinkOptions, IStorage} from './types';

const REFRESH_TOKEN_KEY = ':auth:refreshToken';
const REFRESH_TOKEN_EXPIRES_KEY = ':auth:refreshTokenExpires';
const ACCESS_TOKEN_KEY = ':auth:accessToken';
const ACCESS_TOKEN_EXPIRES_KEY = ':auth:accessTokenExpires';

const DEFAULT_NAMESPACE = 'slicknode';

declare var global: {
  localStorage: IStorage;
};

export const REFRESH_TOKEN_MUTATION = gql`mutation refreshToken($token: String!) {
  refreshAuthToken(input: {refreshToken: $token}) {
    accessToken
    refreshToken
    accessTokenLifetime
    refreshTokenLifetime
  }
}`;

export const LOGOUT_MUTATION = gql`mutation logout($refreshToken: String) {
  logoutUser(input:{refreshToken:$refreshToken}) {
  	success
	}
}`;

/**
 * SlicknodeLink instance to be used to load data with apollo-client
 * from slicknode GraphQL servers
 */
export default class SlicknodeLink extends ApolloLink {

  public options: ISlicknodeLinkOptions;
  public storage: IStorage;
  public namespace: string;

  /**
   * Constructor
   * @param options
   */
  constructor(options: ISlicknodeLinkOptions = {}) {
    super();
    this.options = options;
    this.namespace = options.namespace || DEFAULT_NAMESPACE;
    this.storage = options.storage || global.localStorage || new MemoryStorage();
  }

  /**
   *
   * @param {Operation} operation
   * @param {NextLink} forward
   * @returns {Observable<FetchResult> | null}
   */
  public request(
    operation: Operation,
    forward?: NextLink,
  ): Observable<FetchResult> | null {
    if (!forward) {
      throw new Error(
        'Network link is missing in apollo client or SlicknodeLink is last link in the chain.',
      );
    }
    return new Observable<FetchResult>((observer) => {
      this.getAuthHeaders(forward)
        .then((authHeaders) => {
          operation.setContext(({headers}: {headers: any}) => ({
            headers: {
              ...(headers || {}),
              ...authHeaders,
            },
          }));
          forward(operation).subscribe(observer);
        })
        .catch((error) => {
          this.debug('Error obtaining auth headers in SlicknodeLink');
          observer.error(error);
        });

      // return forward(operation);

    });
  }

  /**
   * Returns true if the client has a valid access token
   *
   * @returns {boolean}
   */
  public hasAccessToken(): boolean {
    return Boolean(this.getAccessToken());
  }

  /**
   * Returns true if the client has a valid refresh token
   *
   * @returns {boolean}
   */
  public hasRefreshToken(): boolean {
    return Boolean(this.getRefreshToken());
  }

  /**
   * Updates the auth token set
   * @param token
   */
  public setAuthTokenSet(token: IAuthTokenSet): void {
    this.setAccessToken(token.accessToken);
    this.setAccessTokenExpires(token.accessTokenLifetime * 1000 + Date.now());
    this.setRefreshToken(token.refreshToken);
    this.setRefreshTokenExpires(token.refreshTokenLifetime * 1000 + Date.now());
  }

  /**
   * Stores the refreshToken in the storage of the client
   * @param token
   */
  public setRefreshToken(token: string) {
    const key = this.namespace + REFRESH_TOKEN_KEY;
    this.storage.setItem(key, token);
  }

  /**
   * Returns the refresh token, NULL if none was stored yet
   * @returns {string|null}
   */
  public getRefreshToken(): string | null {
    if ((this.getRefreshTokenExpires() || 0) < Date.now()) {
      return null;
    }
    const key = this.namespace + REFRESH_TOKEN_KEY;
    return this.storage.getItem(key);
  }

  /**
   * Sets the time when the auth token expires
   */
  public setAccessTokenExpires(timestamp: number | null) {
    const key = this.namespace + ACCESS_TOKEN_EXPIRES_KEY;
    if (timestamp) {
      this.storage.setItem(key, String(timestamp));
    } else {
      this.storage.removeItem(key);
    }
  }

  /**
   * Returns the UNIX Timestamp when the refresh token expires
   * @returns {number|null}
   */
  public getRefreshTokenExpires(): number | null {
    const key = this.namespace + REFRESH_TOKEN_EXPIRES_KEY;
    const expires = this.storage.getItem(key);
    return expires ? parseInt(expires, 10) : null;
  }

  /**
   * Sets the time when the auth token expires
   */
  public setRefreshTokenExpires(
    timestamp: number | null,
  ): void {
    const key = this.namespace + REFRESH_TOKEN_EXPIRES_KEY;
    this.storage.setItem(key, String(timestamp));
  }

  /**
   * Returns the UNIX Timestamp when the access token expires
   * @returns {number|null}
   */
  public getAccessTokenExpires(): number | null {
    const key = this.namespace + ACCESS_TOKEN_EXPIRES_KEY;
    const expires = this.storage.getItem(key) || null;
    return expires ? parseInt(expires, 10) : null;
  }

  /**
   * Writes the access token to storage
   * @param token
   */
  public setAccessToken(token: string): void {
    const key = this.namespace + ACCESS_TOKEN_KEY;
    this.storage.setItem(key, token);
  }

  /**
   * Returns the access token, NULL if no valid token was found
   * @returns {null}
   */
  public getAccessToken(): string | null {
    // Check if is expired
    if ((this.getAccessTokenExpires() || 0) < Date.now()) {
      return null;
    }
    const key = this.namespace + ACCESS_TOKEN_KEY;
    return this.storage.getItem(key) || null;
  }

  /**
   * Clears all tokens in the storage
   */
  public async logout(forward: NextLink): Promise<void> {
    this.storage.removeItem(this.namespace + REFRESH_TOKEN_KEY);
    this.storage.removeItem(this.namespace + REFRESH_TOKEN_EXPIRES_KEY);
    this.storage.removeItem(this.namespace + ACCESS_TOKEN_KEY);
    this.storage.removeItem(this.namespace + ACCESS_TOKEN_EXPIRES_KEY);
  }

  /**
   * Returns the headers that are required to authenticate at the GraphQL endpoint.
   * If no access tokens are available, an attempt is made to retrieve it from the backend
   * with the refreshToken
   */
  public getAuthHeaders(forward: NextLink): Promise<HeadersInit> {
    return new Promise<{[key: string]: string}>((resolve, reject) => {
      const accessToken = this.options.accessToken || this.getAccessToken();
      const refreshToken = this.getRefreshToken();

      if (accessToken) {
        this.debug('Using valid access token');
        resolve({
          Authorization: `Bearer ${accessToken}`,
        });
        return;
      }

      // We have no token, try to get it from API via next link
      if (!accessToken && refreshToken) {
        this.debug('No valid access token found, obtaining new AuthTokenSet with refresh token');
        const refreshOperation = createOperation({}, {
          query: REFRESH_TOKEN_MUTATION,
          variables: {
            token: refreshToken,
          },
        });
        const observer = forward(refreshOperation);
        observer.subscribe({
          error: (error) => {
            this.debug(`Error refreshing AuthTokenSet: ${error.message}`);
          },
          next: (result) => {
            this.debug('Result' + JSON.stringify(result));
            resolve({});
          },
        });
        /*
        // We have refresh token but expired auth token. Refresh auth token set.
        const result = await this.fetch<{refreshAuthToken: IAuthTokenSet | null}>(
          REFRESH_TOKEN_MUTATION,
          {token: refreshToken}
        );
        if (result && result.data && result.data.refreshAuthToken) {
          this.setAuthTokenSet(result.data.refreshAuthToken);
          accessToken = this.getAccessToken();
        } else {
          await this.logout();
        }
        */
      } else {
        resolve({});
      }
    });
  }

  protected debug(message: string) {
    if (this.options.debug) {
      console.debug(`[Slicknode Auth] ${message}`); // tslint:disable-line no-console
    }
  }
}
