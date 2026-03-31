import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { HealthService } from "shared-contract/gen/ts/main_connect";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});

const client = createClient(HealthService, transport);

function App() {
  const [timestamp, setTimestamp] = useState(() => Date.now());
  const { data, error, isLoading } = useQuery({
    queryKey: ['healthPing', timestamp],
    queryFn: async () => {
      return await client.ping({});
    }
  })

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Tasker Health Monitor</h1>
      <button onClick={() => setTimestamp(Date.now())} style={{ padding: "0.5rem 1rem", marginBottom: "1rem" }}>
        Ping Backend
      </button>
      
      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error.message}</p>}
      {data && (
        <div style={{ background: "#d4edda", padding: "1rem", borderRadius: "8px", border: "1px solid #c3e6cb", color: "#155724" }}>
          <p><strong>Message:</strong> {data.message}</p>
          <p><strong>DB Status:</strong> {data.dbStatus}</p>
        </div>
      )}
    </div>
  )
}

export default App
