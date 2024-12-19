import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import styles from "./WalletCard.module.scss";

export function WalletCard() {
  return (
    <Card>
      <CardContent className={styles.content}>
        <h2 className={styles.title}>Wallet Found:</h2>
        <Input placeholder="Wallet Address" className={styles.input} />
        
        <div className={styles.balanceSection}>
          <h3>Balance</h3>
          <div className={styles.balanceList}>
            <div className={styles.balanceItem}>X ADA</div>
            <div className={styles.balanceItem}>X USDM</div>
            <div className={styles.balanceItem}>X SUMI</div>
          </div>
        </div>

        <Button variant="default" className={styles.exportButton}>
          Export Wallet Keys
        </Button>
      </CardContent>
    </Card>
  );
} 