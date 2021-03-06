# Slicknode Apollo Link

![CircleCI](https://img.shields.io/circleci/build/github/slicknode/slicknode-apollo-link)
![npm](https://img.shields.io/npm/v/slicknode-apollo-link)

ApolloLink component that automatically sets authentication headers for GraphQL requests via the [@apollo/client](https://www.apollographql.com/client). It stores the access and refresh tokens in a store (for example InMemory, localStorage, sessionStorage etc.) and keeps track of expiration times. 
If auth tokens expire, they are automatically refreshed in the background when a request is issued, without interruption to the user. Can be combined with any of the available [apollo links](https://www.apollographql.com/docs/link/#linkslist).

Works with any GraphQL API that implements auth mutations as outlined in the [Slicknode documentation](https://slicknode.com/docs/auth/authentication/).

## Installation

Install the [slicknode-apollo-link](https://github.com/slicknode/slicknode-apollo-link) npm package: 

    npm install slicknode-apollo-link

Slicknode Apollo Link has peer dependencies to `graphql` and `@apollo/client` which you should already have installed when you are using the [Apollo Client](https://www.apollographql.com/client).

## Usage

This is a minimal example to create an instance of an apollo client with SlicknodeLink. Refer to the documentation of the
[apollo-client](https://www.apollographql.com/client) to learn how to use and customize it: 

```javascript
import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  ApolloLink,
} from '@apollo/client';
import SlicknodeLink from 'slicknode-apollo-link';

const slicknodeLink = new SlicknodeLink({
  debug: true, // Writes auth debug info to console, disable in production
});

const SLICKNODE_ENDPOINT =
  'https://api.us-east-1.aws.slicknode.com/v1/your-project';

const client = new ApolloClient({
  cache: new InMemoryCache(),
  // Create link chain
  link: ApolloLink.from([
    // Add Slicknode link before HttpLink to add auth headers
    slicknodeLink,

    // ...More links for error handling etc...

    // Network link to make HTTP requests to the API
    new HttpLink({
      uri: SLICKNODE_ENDPOINT,
      credentials: 'same-origin',
      headers: {
        // Uncomment to enable preview mode:
        // 'X-Slicknode-Preview': '1',
        // Uncomment to set default locale:
        // 'X-Slicknode-Locale': 'en-US',
      },
    }),
  ]),
});
```

### Authentication

To authenticate the client on the server and obtain an auth token set, you can execute any mutation 
that returns such data. By adding the directive `@authenticate` to the mutation, the `SlicknodeLink`
automatically picks up the tokens, stores them on the client and adds the required authentication headers
to subsequent requests. 

Make sure that the module with the login mutation is installed and deployed to your Slicknode server. See the list of
[available auth modules](https://slicknode.com/docs/auth/authentication/#authentication-modules) for details.

For example:

```javascript
import { gql } from '@apollo/client';

client.query(gql`
  mutation LoginUser {
    loginEmailPassword(input: {
      email: "email@example.com",
      password: "xyz123"
    }) @authenticate {
      accessToken
      refreshToken
      accessTokenLifetime
      refreshTokenLifetime
    }
  }`
)
  .then(result => {
    console.log('');
  })
  .catch(err => {
    console.log('Something went wrong: ', err.message);
  });
```


### Logout

To log the user out, you can execute the `logoutUser` mutation. This automatically deletes the auth tokens
from the store when successful and invalidates the refresh token no the server: 

```javascript
client.query({
  query: gql`mutation LogoutUser($token: String) {
    logoutUser(input: {refreshToken: $token}) {
      success
    }
  }`,
  variables: {
    // Get the current refreshToken from the SlicknodeLink instance to invalidate it on the server
    token: slicknodeLink.getRefreshToken()
  }
)
  .then(result => {
    console.log('Login successful', result.data.logoutUser);
  })
  .catch(err => {
    console.log('Something went wrong: ', err.message);
  });
```

You might want to clear the apollo client cache after logging a user out to not accidentally expose private data. 
