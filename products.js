const express = require('express');
module.exports = function(db){
  const router = express.Router();

  // List / search
  router.get('/', (req,res)=>{
    const q = req.query.q || '';
    const stmt = db.prepare("SELECT * FROM products WHERE name LIKE ? OR barcode LIKE ? ORDER BY id DESC");
    const rows = stmt.all('%'+q+'%','%'+q+'%');
    res.json(rows);
  });

  // Get by barcode
  router.get('/by-barcode/:code', (req,res)=>{
    const p = db.prepare('SELECT * FROM products WHERE barcode = ?').get(req.params.code);
    if(!p) return res.status(404).json({error:'Not found'});
    res.json(p);
  });

  // Create
  router.post('/', (req,res)=>{
    const { name, barcode, category, price, stock } = req.body;
    try{
      const stmt = db.prepare('INSERT INTO products(name,barcode,category,price,stock) VALUES(?,?,?,?,?)');
      const info = stmt.run(name,barcode,category,price||0,stock||0);
      res.json({id:info.lastInsertRowid});
    }catch(e){
      res.status(400).json({error:e.message});
    }
  });

  // Update
  router.put('/:id', (req,res)=>{
    const { name, barcode, category, price, stock } = req.body;
    const stmt = db.prepare('UPDATE products SET name=?,barcode=?,category=?,price=?,stock=? WHERE id=?');
    stmt.run(name,barcode,category,price,stock,req.params.id);
    res.json({ok:true});
  });

  // Delete
  router.delete('/:id', (req,res)=>{
    db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  // Update stock (add/subtract)
  router.post('/:id/stock', (req,res)=>{
    const { delta } = req.body; // +n or -n
    const p = db.prepare('SELECT stock FROM products WHERE id=?').get(req.params.id);
    if(!p) return res.status(404).json({error:'Not found'});
    const newStock = p.stock + Number(delta||0);
    db.prepare('UPDATE products SET stock=? WHERE id=?').run(newStock, req.params.id);
    res.json({stock:newStock});
  });

  return router;
}
