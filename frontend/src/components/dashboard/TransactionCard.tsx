import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import styles from "./TransactionCard.module.scss";

type Transaction = {
  id: string;
  date: string;
  type: string;
  walletAddress: string;
};

const transactions: Transaction[] = [
  {
    id: 'XYZT',
    date: '12.06.29 - 15:54',
    type: 'Purchase',
    walletAddress: 'addr1...',
  },
  {
    id: 'XYZT',
    date: '12.06.29 - 15:54',
    type: 'Purchase',
    walletAddress: 'addr1...',
  }
];

export function TransactionCard() {
  return (
    <Card>
      <CardContent className={styles.content}>
        <h2 className={styles.title}>Transactions</h2>
        
        <div className={styles.transactionList}>
          {transactions.map((transaction, index) => (
            <Card key={`${transaction.id}-${index}`} className={styles.transaction}>
              <CardContent className={styles.transactionContent}>
                <div className={styles.field}>
                  <span className={styles.label}>Transaction ID:</span>
                  <span>{transaction.id}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Date:</span>
                  <span>{transaction.date}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Type:</span>
                  <span>{transaction.type}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Wallet Address:</span>
                  <span>{transaction.walletAddress}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button className={styles.viewAllButton}>
          View all Transactions
        </Button>
      </CardContent>
    </Card>
  );
} 