# Transactions
- **Transaction Boundaries**: Check if transactions are kept as short as possible to avoid long-held database locks. All data reading that can happen outside a transaction should be outside. Group only strictly bound write/update statements inside `tx`.
- **Consistency**: In complex multi-table mutations, ensure they are wrapped inside standard database transactions to handle intermediate failures gracefully and maintain data integrity.
