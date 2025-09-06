// src/utils/money.ts
export const moneyToNumber = (val:any): number => {
  const raw = String(val ?? '').trim(); if(!raw) return NaN;
  let s = raw.replace(/[^0-9,\.\-]/g,'');
  if(s.includes(',') && s.includes('.')) s = s.replace(/,/g,'');
  else if(s.includes(',') && !s.includes('.')) s = s.replace(/,/g,'.');
  s = s.replace(/(\d)[\s](?=\d{3}\b)/g,'$1');
  const n = parseFloat(s);
  return isNaN(n)?NaN:n;
};
export const numberToEU = (n:number): string => {
  if(typeof n!=='number' || isNaN(n)) return '';
  return new Intl.NumberFormat('de-DE',{minimumFractionDigits:2, maximumFractionDigits:2}).format(n);
};
export const formatEUInput = (val:any) => {
  const num = moneyToNumber(val);
  return isNaN(num) ? '' : numberToEU(num);
};