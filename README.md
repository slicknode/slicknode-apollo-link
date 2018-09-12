# Slicknode Apollo Link

ApolloLink component to use [slicknode-client](https://github.com/slicknode/slicknode-client) 
with [apollo-client](https://www.apollographql.com/client).

## Installation

Install both the [slicknode-client](https://github.com/slicknode/slicknode-client) and the 
[slicknode-apollo-link](https://github.com/slicknode/slicknode-apollo-link) npm package: 

    yarn add slicknode-client slicknode-apollo-link

## Usage

This is a minimal example to create an instance of an apollo client. Refer to the documentation of the
[slicknode-client](https://github.com/slicknode/slicknode-client) and the [apollo-client](https://www.apollographql.com/client)
to learn how to use and customize it: 

```typescript
import SlicknodeClient from 'slicknode-client';
import SlicknodeLink from 'slicknode-apollo-link';
import { ApolloClient } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';

// Create an instance of the slicknode-client
const slicknodeClient = new SlicknodeClient({
  // Set your Slicknode GraphQL endpoint here
  endpoint: 'https://myproject.slicknode.com'
});

// Create the ApolloClient instance to use in your projects
const apolloClient = new ApolloClient({
  // Pass the Slicknode client to the link that should be used by the ApolloClient
  link: new SlicknodeLink({
    client: slicknodeClient
  }),
  
  // Add a cache (required by apollo, change as needed...)
  cache: new InMemoryCache()
});

// Use the apolloClient as usual... (See apollo-client documentation)
```

### Usage with authenticators

To use the `SlicknodeLink` instance in combination with the available authenticators, use the
`SlicknodeClient` instance directly that was passed to the link component. Once the `SlicknodeClient` is authenticated,
the `ApolloClient` instance will also make requests as the authenticated user.

```typescript
// Create slicknode client / apollo client and link as described above
// Then use any authenticator: 

import login from 'slicknode-auth-email-password';

slicknodeClient.authenticate(login('myemail@example.com', 'mysecretpassword'))
    .then(() => {
      console.log('Login successful');
    })
    .catch(e => {
      console.log('Something went wrong: ' + e.message);
    });
``` 

**Tipp:** You might want to invalidate the cached data in the apollo client once the authentication state changes
inside of the slicknode client. 
