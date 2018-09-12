import {expect} from 'chai';
import Client from 'slicknode-client';
import SlicknodeLink from '../index';
import sinon from 'sinon';
import { ApolloClient } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { parse } from 'graphql';

describe('SlicknodeLink', () => {
  it('fails for missing configuration options', () => {
    expect(() => {
      const link = new SlicknodeLink({
        client: null,
      });
    }).to.throw('No instance of a client provided in configuration options for SlicknodeLink');
  });

  it('creates link successfully', () => {
    const client = new Client({
      endpoint: 'https://localhost',
    });
    const link = new SlicknodeLink({
      client,
    });
    expect(link).to.not.equal(null);
  });

  it('sends and receives requests with apollo client', async () => {
    const client = new Client({
      endpoint: 'https://localhost',
    });
    const link = new SlicknodeLink({
      client,
    });

    const payload = {
      data: {
        value: 'test',
      },
    };
    sinon.stub(client, "fetch").resolves(payload);
    const apolloClient = new ApolloClient({
      link,
      cache: new InMemoryCache()
    });

    const result = await apolloClient.query({
      query: parse('{value}')
    });

    expect(result.data).to.deep.equal(payload.data);
  });

  it('handles error with apollo client', async () => {
    const client = new Client({
      endpoint: 'https://localhost',
    });
    const link = new SlicknodeLink({
      client,
    });

    const errorMessage = 'Error fetching data';
    sinon.stub(client, "fetch").throws(errorMessage);
    const apolloClient = new ApolloClient({
      link,
      cache: new InMemoryCache()
    });

    try {
      const result = await apolloClient.query({
        query: parse('{value}')
      });
    } catch (e) {
      expect(e.networkError.name).to.deep.equal(errorMessage);
    }
  });
});
