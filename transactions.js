const express = require('express');
const PDFDocument = require('pdfkit');
module.exports = function(db){
  const router = express.Router();

  // Create transaction
  router.post('/', (req,res)=>{
    const { items, discount = 0, payment_method } = req.body; // items: [{product_id, qty}]
    if(!items || items.length===0) return res.status(400).json({error:'No items'});

    // calculate total
    let total = 0;
    const productStmt = db.prepare('SELECT * FROM products WHERE id=?');
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    const insertTxn = db.prepare('INSERT INTO transactions(total,discount,payment_method,created_at) VALUES(?,?,?,?)');
    const insertItem = db.prepare('INSERT INTO transaction_items(transaction_id,product_id,qty,price) VALUES(?,?,?,?)');

    const now = new Date().toISOString();

    const tx = db.transaction(()=>{
      items.forEach(i=>{
        const p = productStmt.get(i.product_id);
        if(!p) throw new Error('Produk tidak ditemukan');
        if(p.stock < i.qty) throw new Error('Stok tidak cukup: '+p.name);
        total += p.price * i.qty;
      });
      const discounted = Number(discount) || 0;
      const finalTotal = total - discounted;
      const info = insertTxn.run(finalTotal, discounted, payment_method, now);
      const txnId = info.lastInsertRowid;
      items.forEach(i=>{
        const p = productStmt.get(i.product_id);
        insertItem.run(txnId, i.product_id, i.qty, p.price);
        updateStock.run(i.qty, i.product_id);
      });
      return txnId;
    });

    try{
      const txnId = tx();
      res.json({ ok: true, transaction_id: txnId });
    }catch(e){
      res.status(400).json({ error: e.message });
    }
  });

  // Get transaction
  router.get('/:id', (req,res)=>{
    const t = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
    if(!t) return res.status(404).json({error:'Not found'});
    const items = db.prepare('SELECT ti.*, p.name FROM transaction_items ti JOIN products p ON p.id=ti.product_id WHERE ti.transaction_id=?').all(req.params.id);
    res.json({ t, items });
  });

  // Generate PDF receipt
  router.get('/:id/receipt', (req,res)=>{
    const t = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
    if(!t) return res.status(404).send('Not found');
    const items = db.prepare('SELECT ti.*, p.name FROM transaction_items ti JOIN products p ON p.id=ti.product_id WHERE ti.transaction_id=?').all(req.params.id);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-disposition', `attachment; filename=receipt_${req.params.id}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(16).text('Struk Penjualan', { align: 'center' });
    doc.moveDown();
    items.forEach(it=>{
      doc.fontSize(12).text(`${it.name} x${it.qty} - Rp ${ (it.price*it.qty).toFixed(0) }`);
    });
    doc.moveDown();
    doc.text(`Total: Rp ${t.total.toFixed(0)}`);
    doc.text(`Metode: ${t.payment_method}`);
    doc.text(`Tanggal: ${t.created_at}`);

    doc.end();
  });

  return router;
}
