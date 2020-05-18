import {ApolloLink, execute, FetchResult, GraphQLRequest, Observable} from 'apollo-link';
import {expect} from 'chai';
import gql from 'graphql-tag';
import sinon from 'sinon';
import SlicknodeLink, {REFRESH_TOKEN_MUTATION} from '../SlicknodeLink';
import {IAuthTokenSet} from '../types';
import {MemoryStorage} from '../storage';
import {GraphQLError} from 'graphql';

// tslint:disable no-unused-expression

describe('SlicknodeLink', () => {
  it('forwards request to next link', (done) => {
    const data = {
      test: true,
    };

    const nextLink = sinon.stub().callsFake((e) => {
      return new Observable<FetchResult>((observer) => {
        observer.next({data});
      });
    });

    const slicknodeLink = ApolloLink.from([
      new SlicknodeLink({
        storage: new MemoryStorage(),
      }),
      new ApolloLink(nextLink),
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
        expect(nextLink.calledOnce).to.be.true;
        done();
      },
      error: done,
    });
  });

  it('obtains auth tokens via httpsCookies if no storage set', (done) => {
    const data = {
      test: true,
    };
    const refreshData = {
      refreshToken: {
        accessToken: '234',
        accessTokenLifetime: 23,
        refreshToken: 'refresh',
        refreshTokenLifetime: 100,
      },
    };
    const responses = [
      {data: refreshData},
      {data},
    ];

    const nextLink = sinon.stub().callsFake((e) => {
      return new Observable<FetchResult>((observer) => {
        observer.next(responses.shift());
      });
    });

    const slicknodeLink = ApolloLink.from([
      new SlicknodeLink(),
      new ApolloLink(nextLink),
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
        const calls = nextLink.getCalls();
        expect(calls.length).to.equal(2);
        expect(calls[0].args[0].query).to.equal(REFRESH_TOKEN_MUTATION);
        expect(calls[0].args[0].variables).to.deep.equal({token: null}); // No token set
        expect(calls[1].args[0].query).to.equal(query);
        expect(calls[1].args[0].variables).to.equal(request.variables);
        done();
      },
      error: done,
    });
  });

  it('does not retry refresh token via cookie after one failed attempt', (done) => {
    const data = {
      test: true,
    };
    const refreshData = {
      refreshToken: {
        accessToken: '234',
        accessTokenLifetime: 23,
        refreshToken: 'refresh',
        refreshTokenLifetime: 100,
      },
    };
    const responses = [
      {errors: [ new GraphQLError('Failed to refresh') ], data: {refreshToken: null as any}},
      {data},
      {data},
    ];

    const nextLink = sinon.stub().callsFake((e) => {
      return new Observable<FetchResult>((observer) => {
        observer.next(responses.shift());
      });
    });

    const slicknodeLink = new SlicknodeLink();
    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink(nextLink),
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
        const calls = nextLink.getCalls();
        expect(calls.length).to.equal(2);
        expect(calls[0].args[0].query).to.equal(REFRESH_TOKEN_MUTATION);
        expect(calls[0].args[0].variables).to.deep.equal({token: null}); // No token set
        expect(calls[1].args[0].query).to.equal(query);
        expect(calls[1].args[0].variables).to.equal(request.variables);

        expect(slicknodeLink.hasAccessToken()).to.be.false;
        expect(slicknodeLink.hasRefreshToken()).to.be.false;

        // Execute query again
        const observable2 = execute(link, request);
        observable2.subscribe({
          next(result2: FetchResult): void {
            const calls = nextLink.getCalls();
            expect(calls.length).to.equal(3); // Only increased by the actual call, no refresh
            expect(calls[2].args[0].query).to.equal(query);
            expect(calls[2].args[0].variables).to.equal(request.variables);
            expect(result2.data).to.equal(data);
            done();
          },
          error: done,
        });
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

  it('uses accessToken from auth token set', (done) => {
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

  it('returns valid value for hasAccessToken', () => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const slicknodeLink = new SlicknodeLink();
    expect(slicknodeLink.hasAccessToken()).to.be.false;
    slicknodeLink.setAuthTokenSet(authTokenSet);
    expect(slicknodeLink.hasAccessToken()).to.be.true;
  });

  it('returns valid value for hasRefreshToken', () => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const slicknodeLink = new SlicknodeLink();
    expect(slicknodeLink.hasRefreshToken()).to.be.false;
    slicknodeLink.setAuthTokenSet(authTokenSet);
    expect(slicknodeLink.hasRefreshToken()).to.be.true;
  });

  it('removes access token if expire is set to NULL', () => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);
    expect(slicknodeLink.hasAccessToken()).to.be.true;
    slicknodeLink.setAccessTokenExpires(null);
    expect(slicknodeLink.hasAccessToken()).to.be.false;
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

  it('executes refreshToken request in subsequent links and adds auth headers', (done) => {
    const data = {
      test: true,
    };
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: -20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const refreshedAuthTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken2',
      accessTokenLifetime: 20,
      refreshToken: 'refresh2',
      refreshTokenLifetime: 200,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);

    let refreshTokenExecuted = false;
    const query = gql`{test}`;
    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        if (!refreshTokenExecuted) {
          // First request refreshes auth tokens
          expect(operation.query).to.deep.equal(gql`${REFRESH_TOKEN_MUTATION}`);
          expect(operation.variables).to.deep.equal({
            token: authTokenSet.refreshToken,
          });
          expect(operation.getContext()).to.deep.equal({});
          refreshTokenExecuted = true;
          return new Observable<FetchResult>((observer) => {
            observer.next({
              data: {
                refreshAuthToken: refreshedAuthTokenSet,
              },
            });
          });
        }
        // Second request returns actual results and should contain auth headers
        expect(operation.query).to.deep.equal(query);
        expect(operation.variables).to.deep.equal({});
        expect(operation.getContext()).to.deep.equal({
          headers: {
            Authorization: `Bearer ${refreshedAuthTokenSet.accessToken}`,
          },
        });
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        done();
      },
      error: done,
    });
  });

  it('executes refreshToken only once for concurrent requests', (done) => {
    const data = {
      test: true,
    };
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: -20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const refreshedAuthTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken2',
      accessTokenLifetime: 20,
      refreshToken: 'refresh2',
      refreshTokenLifetime: 200,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);

    let refreshTokenExecuted = false;
    const query = gql`{test}`;
    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        if (!refreshTokenExecuted) {
          // First request refreshes auth tokens
          expect(operation.query).to.deep.equal(gql`${REFRESH_TOKEN_MUTATION}`);
          expect(operation.variables).to.deep.equal({
            token: authTokenSet.refreshToken,
          });
          expect(operation.getContext()).to.deep.equal({});
          refreshTokenExecuted = true;
          return new Observable<FetchResult>((observer) => {
            // Run in next event loop to test concurrent requests
            setTimeout(() => {
              observer.next({
                data: {
                  refreshAuthToken: refreshedAuthTokenSet,
                },
              });
            }, 0);
          });
        }
        // Second request returns actual results and should contain auth headers
        expect(operation.query).to.deep.equal(query);
        expect(operation.variables).to.deep.equal({});
        expect(operation.getContext()).to.deep.equal({
          headers: {
            Authorization: `Bearer ${refreshedAuthTokenSet.accessToken}`,
          },
        });
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const request: GraphQLRequest = {
      query,
      variables: {},
    };

    // Execute two requests concurrently
    const observable = execute(link, request);
    const observable2 = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        // done();
      },
      error: done,
    });
    observable2.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        done();
      },
      error: done,
    });
  });

  it('ignores invalid refreshToken', (done) => {
    const data = {
      test: true,
    };
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: -20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const refreshedAuthTokenSet = {
      accessToken: 'accessToken2',
      accessTokenLifetime: 'invalid',
      refreshToken: 'refresh2',
      refreshTokenLifetime: 200,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);

    let refreshTokenExecuted = false;
    const query = gql`{test}`;
    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        if (!refreshTokenExecuted) {
          // First request refreshes auth tokens
          expect(operation.query).to.deep.equal(gql`${REFRESH_TOKEN_MUTATION}`);
          expect(operation.variables).to.deep.equal({
            token: authTokenSet.refreshToken,
          });
          expect(operation.getContext()).to.deep.equal({});
          refreshTokenExecuted = true;
          return new Observable<FetchResult>((observer) => {
            observer.next({
              data: {
                refreshAuthToken: refreshedAuthTokenSet,
              },
            });
          });
        }
        // Second request returns actual results and should contain auth headers
        expect(operation.query).to.deep.equal(query);
        expect(operation.variables).to.deep.equal({});
        expect(operation.getContext()).to.deep.equal({headers: {}});
        expect(slicknodeLink.getRefreshToken()).to.be.null;
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        done();
      },
      error: done,
    });
  });

  it('ignores expired accessToken from automatic refresh', (done) => {
    const data = {
      test: true,
    };
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: -20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const refreshedAuthTokenSet = {
      accessToken: 'accessToken2',
      accessTokenLifetime: -20,
      refreshToken: 'refresh2',
      refreshTokenLifetime: 200,
    };
    const slicknodeLink = new SlicknodeLink();
    slicknodeLink.setAuthTokenSet(authTokenSet);

    let refreshTokenExecuted = false;
    const query = gql`{test}`;
    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink((operation) => {
        if (!refreshTokenExecuted) {
          // First request refreshes auth tokens
          expect(operation.query).to.deep.equal(gql`${REFRESH_TOKEN_MUTATION}`);
          expect(operation.variables).to.deep.equal({
            token: authTokenSet.refreshToken,
          });
          expect(operation.getContext()).to.deep.equal({});
          refreshTokenExecuted = true;
          return new Observable<FetchResult>((observer) => {
            observer.next({
              data: {
                refreshAuthToken: refreshedAuthTokenSet,
              },
            });
          });
        }
        // Second request returns actual results and should contain auth headers
        expect(operation.query).to.deep.equal(query);
        expect(operation.variables).to.deep.equal({});
        expect(operation.getContext()).to.deep.equal({headers: {}});
        expect(slicknodeLink.hasAccessToken()).to.be.false;
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    const observable = execute(link, request);
    observable.subscribe({
      next(result: FetchResult) {
        expect(result.data).to.equal(data);
        done();
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
          authTokenSet.accessTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getAccessTokenExpires()).to.be.below(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() + 1,
        );
        expect(slicknodeLink.getRefreshToken()).to.deep.equal(authTokenSet.refreshToken);
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.above(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.below(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() + 1,
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
          authTokenSet.accessTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getAccessTokenExpires()).to.be.below(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() + 1,
        );
        expect(slicknodeLink.getRefreshToken()).to.deep.equal(authTokenSet.refreshToken);
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.above(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.below(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() + 1,
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

  it('ignores NULL result from mutation field via authentication directive', (done) => {
    const data = {
      loginMutation: null as any,
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

  it('ignores invalid auth token type result from mutation field via authentication directive', (done) => {
    const data = {
      loginMutation: {
        accessToken: 'accessToken1',
        accessTokenLifetime: '20',
        refreshToken: 'refresh1',
        refreshTokenLifetime: 100,
      },
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

  it('adds auth token set via directive on alias field', (done) => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const data = {
      alias: authTokenSet,
    };
    const slicknodeLink = new SlicknodeLink({
      storage: new MemoryStorage(),
    });
    const dataLoaderStub = sinon.stub();

    const nextLink = sinon.stub().callsFake(() => {
      return new Observable<FetchResult>((observer) => {
        dataLoaderStub();
        observer.next({data});
      });
    });

    const link = ApolloLink.from([
      slicknodeLink,
      new ApolloLink(nextLink),
    ]);
    const query = gql`mutation LoginMutation {
      alias: loginMutation @authenticate {
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
          authTokenSet.accessTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getAccessTokenExpires()).to.be.below(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() + 1,
        );
        expect(slicknodeLink.getRefreshToken()).to.deep.equal(authTokenSet.refreshToken);
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.above(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.below(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() + 1,
        );

        expect(nextLink.calledOnce).to.be.true;
        expect(dataLoaderStub.calledOnce).to.be.true;
        done();
      },
      error: done,
    });
  });

  it('adds auth token set for multiple mutations in one query', (done) => {
    const authTokenSet: IAuthTokenSet = {
      accessToken: 'accessToken1',
      accessTokenLifetime: 20,
      refreshToken: 'refresh1',
      refreshTokenLifetime: 100,
    };
    const data = {
      otherMutation: true,
      loginMutation: authTokenSet,
      test: true,
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
      otherMutation
      loginMutation @authenticate {
        accessToken
        accessTokenLifetime
        refreshToken
        refreshTokenLifetime
      }
      test: otherMutation2
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
          authTokenSet.accessTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getAccessTokenExpires()).to.be.below(
          authTokenSet.accessTokenLifetime * 1000 + Date.now() + 1,
        );
        expect(slicknodeLink.getRefreshToken()).to.deep.equal(authTokenSet.refreshToken);
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.above(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() - 1000,
        );
        expect(slicknodeLink.getRefreshTokenExpires()).to.be.below(
          authTokenSet.refreshTokenLifetime * 1000 + Date.now() + 1,
        );
        done();
      },
      error: done,
    });
  });

  it('removes auth tokens from link on logout', (done) => {
    const data = {
      logoutUser: {
        success: true,
      },
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
      new ApolloLink(() => {
        return new Observable<FetchResult>((observer) => {
          observer.next({data});
        });
      }),
    ]);
    const query = gql`mutation LogoutMutation($token: String) {
      logoutUser(input: {refreshToken: $token}) {
        success
      }
    }`;
    const request: GraphQLRequest = {
      query,
      variables: {
        token: authTokenSet.refreshToken,
      },
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

  it('throws error if SlicknodeLink is last link in chain', () => {
    const slicknodeLink = new SlicknodeLink();

    const link = ApolloLink.from([
      slicknodeLink,
    ]);
    const query = gql`{test}`;
    const request: GraphQLRequest = {
      query,
      variables: {},
    };
    expect(() => {
      execute(link, request);
    }).to.throw('Network link is missing in apollo client or SlicknodeLink is last link in the chain.');
  });
});
