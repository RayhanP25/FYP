import { useState } from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

function QueryProvider({ children }: any) {
  const [client] = useState(
    new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
        },
      },
    })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export { QueryProvider };
