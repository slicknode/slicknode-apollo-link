import {ApolloLink, execute, FetchResult, GraphQLRequest, Observable} from 'apollo-link';
import {expect} from 'chai';
import gql from 'graphql-tag';
import sinon from 'sinon';
import SlicknodeLink, {REFRESH_TOKEN_MUTATION} from '../SlicknodeLink';
import {IAuthTokenSet} from '../types';

describe('SlicknodeLink', () => {
  it('forwards request to next link', (done) => {
    const data = {
      test: true,
    };
    const slicknodeLink = ApolloLink.from([
      new SlicknodeLink(),
      new ApolloLink((e) => {
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const query = gql`{test}`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(slicknodeLink, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        done();
      },
      error: done,
    });
  });

  it('forwards accessToken from options', (done) => {
    const data = {
      test: true,
    };
    const accessToken = 'abc123';
    const slicknodeLink = new SlicknodeLink({
      accessToken,
    });
    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        expect(operation.getContext()).to.deep.equal({
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        done();
        return null;
      }),
    ]);
    const query = gql`{test}`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
      },
      error: done,
    });
  });

  it('uses accessToken form auth token set', (done) => {
    const data = {
      test: true,
    };
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        expect(operation.getContext()).to.deep.equal({
          headers: {
            Authorization: `Bearer ${authTokenSet.accessToken}`,
          },
        });
        done();
        return null;
      }),
    ]);
    const query = gql`{test}`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
      },
      error: done,
    });
  });

  it('does not use expired accessToken form auth token set', (done) => {
    const data = {
      test: true,
    };
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: -20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: -100,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        expect(operation.getContext()).to.deep.equal({
          headers: {},
        });
        done();
        return null;
      }),
    ]);
    const query = gql`{test}`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
      },
      error: done,
    });
  });

  it('executes refreshToken request in subsequent links', (done) => {
    const data = {
      test: true,
    };
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: -20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        expect(operation.query).to.deep.equal(gql`${REFRESH_TOKEN_MUTATION}`);
        expect(operation.variables).to.deep.equal({
          token: authTokenSet.refreshToken,
        });
        expect(operation.getContext()).to.deep.equal({});
        done();
        return null;
      }),
    ]);
    const query = gql`{test}`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
      },
      error: done,
    });
  });

  it('adds auth token set via unnamed mutation + directive', (done) => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const data = {
      loginMutation: authTokenSet,
    };
    const slicknodeLink = new SlicknodeLink();

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink(() => {
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const query = gql`mutation {
      loginMutation @authenticate {
        accessToken
        accessTokenLifetime
        refreshToken
        refreshTokenLifetime
      }
    }`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        expect(slicknodeLink.getAccessToken()).to.deep.equal(authTokenSet.accessToken);
        expect(slicknodeLink.getAccessTokenExpires()).to.be.above(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() - 1000
        );
        expect(slicknodeLink.getAccessTokenExpires()).to.be.below(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() + 1
        );
        expect(slicknodeLink.getRefreshToken()).to.deep.equal(authTokenSet.refreshToken);
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.above(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() - 1000
        );
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.below(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() + 1
        );
        done();
      },
      error: done,
    });
  });

  it('adds auth token set via named mutation + directive', (done) => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const data = {
      loginMutation: authTokenSet,
    };
    const slicknodeLink = new SlicknodeLink();

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink(() => {
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const query = gql`mutation LoginMutation {
      loginMutation @authenticate {
        accessToken
        accessTokenLifetime
        refreshToken
        refreshTokenLifetime
      }
    }
    `;
    const request: GraphQLRequest = {
      query,
      variables: {},
      operationName: 'LoginMutation',
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        expect(slicknodeLink.getAccessToken()).to.deep.equal(authTokenSet.accessToken);
        expect(slicknodeLink.getAccessTokenExpires()).to.be.above(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() - 1000
        );
        expect(slicknodeLink.getAccessTokenExpires()).to.be.below(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() + 1
        );
        expect(slicknodeLink.getRefreshToken()).to.deep.equal(authTokenSet.refreshToken);
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.above(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() - 1000
        );
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.below(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() + 1
        );
        done();
      },
      error: done,
    });
  });

  it('ignores invalid result from mutation field via authentication directive', (done) => {
    const data = {
      loginMutation: {},
    };
    const slicknodeLink = new SlicknodeLink();

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink(() => {
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const query = gql`mutation {
      loginMutation @authenticate {
        accessToken
        accessTokenLifetime
        refreshToken
        refreshTokenLifetime
      }
    }`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        expect(slicknodeLink.getAccessToken()).to.be.null;
        expect(slicknodeLink.getAccessTokenExpires()).to.be.null;
        expect(slicknodeLink.getRefreshToken()).to.be.null;
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.null;
        done();
      },
      error: done,
    });
  });

  it('ignores authentication directive in query', (done) => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const data = {
      loginMutation: authTokenSet,
    };
    const slicknodeLink = new SlicknodeLink();

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink(() => {
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const query = gql`query LoginMutation {
      loginMutation @authenticate {
        accessToken
        accessTokenLifetime
        refreshToken
        refreshTokenLifetime
      }
    }
    `;
    const request: GraphQLRequest = {
      query,
      variables: {},
      operationName: 'LoginMutation',
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        expect(slicknodeLink.getAccessToken()).to.be.null;
        expect(slicknodeLink.getAccessTokenExpires()).to.be.null;
        expect(slicknodeLink.getRefreshToken()).to.be.null;
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.null;
        done();
      },
      error: done,
    });
  });

  it('ignores login mutation without authenticate directive', (done) => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const data = {
      loginMutation: authTokenSet,
    };
    const slicknodeLink = new SlicknodeLink();

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink(() => {
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const query = gql`mutation LoginMutation {
      loginMutation {
        accessToken
        accessTokenLifetime
        refreshToken
        refreshTokenLifetime
      }
    }
    `;
    const request: GraphQLRequest = {
      query,
      variables: {},
      operationName: 'LoginMutation',
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        expect(slicknodeLink.getAccessToken()).to.be.null;
        expect(slicknodeLink.getAccessTokenExpires()).to.be.null;
        expect(slicknodeLink.getRefreshToken()).to.be.null;
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.null;
        done();
      },
      error: done,
    });
  });
});
