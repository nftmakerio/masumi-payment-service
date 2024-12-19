import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { WalletCard } from "@/components/dashboard/WalletCard";
import { SendForm } from "@/components/dashboard/SendForm";
import { AgentCard } from "@/components/dashboard/AgentCard";
import { TransactionCard } from "@/components/dashboard/TransactionCard";
import styles from "./index.module.scss";

export default function Dashboard() {
  return (
    <DashboardLayout>
      <h1 className={styles.pageTitle}>Admin Dashboard</h1>
      <div className={styles.grid}>
        <WalletCard />
        <SendForm />
      </div>
      <div className={styles.bottomSection}>
        <AgentCard />
        <TransactionCard />
      </div>
    </DashboardLayout>
  );
}