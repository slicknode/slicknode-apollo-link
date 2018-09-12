import {ApolloLink, FetchResult, Observable} from 'apollo-link';
import { print } from 'graphql/language/printer';
import Client from 'slicknode-client';

interface IOptions {
  /**
   * A custom slicknode client
   */
  client: Client;
}

/**
 * Creates an ApolloLink instance to be used with apollo-client
 * @param {IOptions} options
 * @returns {ApolloLink}
 */
function createLink(options: IOptions): ApolloLink {
  const client = options.client;
  if (!client || !(client instanceof Client)) {
    throw new Error('No instance of a client provided in configuration options for SlicknodeLink');
  }
  return new ApolloLink((operation) =>
    new Observable((observer) => {
      const {
        operationName,
        variables,
        query,
      } = operation;

      const queryString = print(query);
      // $FlowFixMe: client is always defined
      client.fetch(queryString, variables, operationName)
        .then((result) => {
          observer.next(result as FetchResult<Record<string, any>, Record<string, any>>);
          observer.complete();
          return result;
        })
        .catch((err) => {
          // fetch was cancelled so its already been cleaned up in the unsubscribe
          // if (err.name === 'AbortError') return;

          observer.error(err);
        });
    }),
  );
}

/**
 * SlicknodeLink instance to be used to load data with apollo-client
 * from slicknode GraphQL servers
 */
export default class SlicknodeLink extends ApolloLink {
  constructor(options: IOptions) {
    const link = createLink(options);
    super(link.request);
  }
}
