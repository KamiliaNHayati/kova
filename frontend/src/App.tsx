import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useWallet } from "./context/WalletContext";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import WalletSetup from "./pages/WalletSetup";
import Services from "./pages/Services";
import Activity from "./pages/Activity";
import HowItWorks from "./pages/HowItWorks";
import Settings from "./pages/Settings";
import Provider from "./pages/Provider";
import Pipelines from "./pages/Pipelines";

// Page transition animations (Smooth fade and scale up)
const pageVariants: any = {
  initial: { opacity: 0, scale: 0.97, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.6 } },
  exit: { opacity: 0, scale: 1.02, y: -20, transition: { duration: 0.4 } },
};

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const { isConnected } = useWallet();
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      {location.pathname === "/how-it-works" ? (
        <PageWrapper key="how-it-works">
          <HowItWorks />
        </PageWrapper>
      ) : !isConnected ? (
        <PageWrapper key="landing">
          <Landing />
        </PageWrapper>
      ) : (
        <PageWrapper key="dashboard">
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/setup" element={<WalletSetup />} />
              <Route path="/services" element={<Services />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/provider" element={<Provider />} />
              <Route path="/pipelines" element={<Pipelines />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        </PageWrapper>
      )}
    </AnimatePresence>
  );
}
