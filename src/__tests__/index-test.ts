import {ApolloLink, execute, FetchResult, GraphQLRequest, Observable} from 'apollo-link';
import {expect} from 'chai';
import { parse } from 'graphql';
import gql from 'graphql-tag';
import sinon from 'sinon';
import SlicknodeLink from '../index';

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
});
