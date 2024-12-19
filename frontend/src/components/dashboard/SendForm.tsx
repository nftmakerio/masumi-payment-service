import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "./SendForm.module.scss";

export function SendForm() {
  return (
    <Card>
      <CardContent className={styles.content}>
        <h2 className={styles.title}>Send</h2>
        <form className={styles.form}>
          <Input placeholder="Receiving Address" />
          
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select Asset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ada">ADA</SelectItem>
              <SelectItem value="usdm">USDM</SelectItem>
              <SelectItem value="sumi">SUMI</SelectItem>
            </SelectContent>
          </Select>
          
          <Input placeholder="Amount" type="number" />
          
          <Button type="submit" className={styles.sendButton}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
} 