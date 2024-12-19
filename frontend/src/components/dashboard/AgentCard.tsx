import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import styles from "./AgentCard.module.scss";

export function AgentCard() {
  return (
    <Card>
      <CardContent className={styles.content}>
        <h2 className={styles.title}>Agent Registered on Masumi</h2>
        
        <div className={styles.details}>
          <h3>Details</h3>
          
          <div className={styles.info}>
            <div className={styles.field}>
              <span className={styles.label}>Name:</span>
              <span>Test Agent 1</span>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>Description:</span>
              <span>A powerful AI assistant that helps with natural language processing, code generation, and general knowledge queries. Specialized in Cardano blockchain technology.</span>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>Author:</span>
              <span>Patrick Tobler</span>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>Contact:</span>
              <span>patrick@nmkr.io</span>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>Tags:</span>
              <span>NLP, XYZ, ZZZ</span>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>Terms of Service:</span>
              <a href="https://terms.com" target="_blank" rel="noopener noreferrer">https.terms.com</a>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>Privacy Policy:</span>
              <a href="https://terms.com" target="_blank" rel="noopener noreferrer">https.terms.com</a>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>Additional Documentation:</span>
              <a href="https://terms.com" target="_blank" rel="noopener noreferrer">https.terms.com</a>
            </div>
            
            <div className={styles.field}>
              <span className={styles.label}>API URL:</span>
              <a href="https://api.com" target="_blank" rel="noopener noreferrer">https.api.com</a>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <Button>
            Deregister Agent
          </Button>
          <Button>
            View on Masumi Explorer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 