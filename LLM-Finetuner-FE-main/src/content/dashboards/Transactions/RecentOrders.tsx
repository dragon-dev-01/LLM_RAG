import { Card } from '@mui/material';
import { CryptoOrder } from 'src/models/crypto_order';
import RecentOrdersTable from './RecentOrdersTable';
import { subDays } from 'date-fns';

function RecentOrders() {
  return (
    <Card>
      <RecentOrdersTable />
    </Card>
  );
}

export default RecentOrders;
