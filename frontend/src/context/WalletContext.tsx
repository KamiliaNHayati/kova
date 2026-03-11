import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from "@stacks/connect";

interface WalletState {
  isConnected: boolean;
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  isConnected: false,
  address: null,
  connect: async () => { },
  disconnect: () => { },
});

function getStoredAddress(): string | null {
  const data = getLocalStorage();
  if (!data?.addresses?.stx?.length) return null;
  return data.addresses.stx[0].address ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(stacksIsConnected());
  const [address, setAddress] = useState<string | null>(getStoredAddress());

  const connect = useCallback(async () => {
    try {
      const result = await stacksConnect();
      const stxAddresses = result.addresses.filter(
        (a) => a.symbol === "STX" || a.address.startsWith("ST") || a.address.startsWith("SP")
      );
      const addr = stxAddresses[0]?.address ?? result.addresses[0]?.address ?? null;
      setAddress(addr);
      setIsConnected(true);
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  }, []);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setIsConnected(false);
    setAddress(null);
    window.location.href = "/";
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
