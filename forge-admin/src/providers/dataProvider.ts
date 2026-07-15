// @ts-nocheck


const API_URL = "http://localhost:3000/.databox/forge";
const TOKEN = "12345678901234567890123456789012";

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
};

export const dataProvider = {
  getList: async ({ resource }) => {
    if (resource === "programs") {
      const data = await fetchWithAuth(`${API_URL}/programs`);
      // Databox returns { programs: [...] }
      const items = data.programs || [];
      // Refine requires an 'id' field for each record
      const formattedItems = items.map((p: any) => ({
        ...p,
        id: p.profileId,
      }));
      return {
        data: formattedItems,
        total: formattedItems.length,
      };
    }
    throw new Error(`Unsupported getList resource: ${resource}`);
  },

  getOne: async () => {
    throw new Error("getOne not implemented for Forge API");
  },

  create: async ({ resource, variables }) => {
    if (resource === "programs") {
      const data = await fetchWithAuth(`${API_URL}/programs`, {
        method: "POST",
        body: JSON.stringify(variables),
      });
      return { data: { id: Date.now(), ...data } as any };
    }
    if (resource === "mappings") {
      const data = await fetchWithAuth(`${API_URL}/mappings`, {
        method: "POST",
        body: JSON.stringify(variables),
      });
      return { data: { id: Date.now(), ...data } as any };
    }
    if (resource === "source-events") {
      const data = await fetchWithAuth(`${API_URL}/source-events`, {
        method: "POST",
        body: JSON.stringify(variables),
      });
      return { data: { id: Date.now(), ...data } as any };
    }
    throw new Error(`Unsupported create resource: ${resource}`);
  },

  update: async () => {
    throw new Error("update not implemented for Forge API");
  },

  deleteOne: async () => {
    throw new Error("deleteOne not implemented for Forge API");
  },

  getApiUrl: () => API_URL,
};
