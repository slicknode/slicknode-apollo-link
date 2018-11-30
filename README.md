# Slicknode Apollo Link

ApolloLink component that automatically sets authentication headers for GraphQL requests via the [apollo-client](https://www.apollographql.com/client). It stores the access and refresh tokens in a store (for example InMemory, localStorage, sessionStorage etc.) and keeps track of expiration times. 
If auth tokens expire, they are automatically refreshed in the background when a request is issued, without interruption to the user. Can be combined with any of the available [apollo links](https://www.apollographql.com/docs/link/#linkslist).

## Installation

Install the [slicknode-apollo-link](https://github.com/slicknode/slicknode-apollo-link) npm package: 

    yarn add slicknode-apollo-link

There is also a peer dependencie to `graphql` which you should already have installed when you are using the [apollo-client](https://www.apollographql.com/client).

## Usage

This is a minimal example to create an instance of an apollo client. Refer to the documentation of the
[apollo-client](https://www.apollographql.com/client) to learn how to use and customize it: 

```javascript
import SlicknodeLink from 'slicknode-apollo-link';
import { ApolloClient } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { ApolloLink } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';

const slicknodeLink = new SlicknodeLink();

// Create the ApolloClient instance to use in your projects
const client = new ApolloClient({
  link: ApolloLink.from([
    // Add the slicknode link somewhere before the HttpLink
    slicknodeLink,

    // ... more links (retry, error handling etc.)

    new HttpLink({
      // Add your slicknode GraphQL endpoint here
      uri: 'https://you-project.slicknode.com',
      credentials: 'same-origin',
    }),
  ]),
  
  // Add a cache (required by apollo, change as needed...)
  cache: new InMemoryCache()
});

// Use the client as usual... (See apollo-client documentation)
```

### Authentication

To authenticate the client on the server and obtain an auth token set, you can execute any mutation 
that returns such data. By adding the directive `@authenticate` to the mutation, the `SlicknodeLink`
automatically picks up the tokens, stores them on the client and adds the required authentication headers
to subsequent requests. 

Make sure that the module with the login mutation is installed and deployed to your Slicknode server. See the list of
[available auth modules](#available-auth-modules) for details.

For example:

```javascript
import { gql } from 'graphql-tag';

client.query(gql`
  mutation LoginUser {
    loginEmailPassword(input: {email: "email@example.com", password: "xyz123"}) @authenticate {
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

### Available Auth Modules


