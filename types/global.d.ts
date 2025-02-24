interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (eventName: string, callback: (...args: unknown[]) => void) => void;
      removeListener?: (eventName: string, callback: (...args: unknown[]) => void) => void;
    };
}