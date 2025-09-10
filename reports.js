const express = require('express');
const ExcelJS = require('exceljs');
module.exports = function(db){
  const router = express.Router();

  // Simple sales summary by day range
  router.get('/sales', (req,res)=>{
    const { from, to, group='daily' } = req.query; // ISO dates
    // group: daily, weekly, monthly
    let sql = `SELECT created_at, total FROM transactions WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at`;
    const rows = db.prepare(sql).all(from, to);
    // aggregate
    const map = {};
    rows.forEach(r=>{
      const d = new Date(r.created_at);
      let key;
      if(group==='monthly') key = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`;
      else if(group==='weekly') {
        const week = Math.ceil((d.getDate())/7);
        key = `${d.getFullYear()}-W${week}`;
      } else key = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}-${('0'+d.getDate()).slice(-2)}`;
      map[key] = (map[key]||0) + r.total;
    });
    const data = Object.keys(map).map(k=>({ period:k, total: map[k] }));
    res.json({ data });
  });

  // Export XLSX
  router.get('/sales/export', async (req,res)=>{
    const { from, to } = req.query;
    const rows = db.prepare('SELECT * FROM transactions WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at').all(from,to);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales');
    sheet.addRow(['ID','Total','Discount','Payment','Created At']);
    rows.forEach(r=> sheet.addRow([r.id, r.total, r.discount, r.payment_method, r.created_at]));
    res.setHeader('Content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-disposition', 'attachment; filename=sales.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  });

  return router;
}
