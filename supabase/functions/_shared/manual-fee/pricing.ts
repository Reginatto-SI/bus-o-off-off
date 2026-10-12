import {ManualFeeError} from './auth.ts';

// Preserve the existing admin precedence: positive ticket-type price, category,
// then the authorized operator's manual base price. Values come from the backend.
export function manualItemBasePrice(base:number,typePrice:unknown,categoryPrice:unknown):number {
 const typed=typePrice==null?null:Number(typePrice);
 const category=categoryPrice==null?null:Number(categoryPrice);
 if(!Number.isFinite(base)||base<0||(typed!==null&&(!Number.isFinite(typed)||typed<0))||(category!==null&&(!Number.isFinite(category)||category<0)))throw new ManualFeeError('manual_price_invalid',400);
 return Math.round((typed!==null&&typed>0?typed:category??base)*100)/100;
}
