(function ($) {
   
   $.fn.conceptMap = function(options){

     var opts = $.extend({}, $.fn.conceptMap.defaults, options);

     var caches = {
       rectCache: {},
       edgePointCache: {},
       clearCaches: function() {
	 this.edgePointCache = {};
	 this.rectCache = {};
       }
     };

     /*
      * VECTOR
      */

     function createVector(x,y) {
       var obj ={};
       obj.x = x;
       obj.y = y;
       
       obj.scale = function(scale) {
	 obj.x *= scale;
	 obj.y *= scale;
	 return obj;
       };
       
       obj.translate = function() {
	 if (typeof(arguments[0]) === "object") {
	   obj.x += arguments[0].x;
	   obj.y += arguments[0].y;
	 } else {
	   obj.x += arguments[0];
	   obj.y += arguments[1];
	 }
	 return obj;
       };
       
       obj.len = function() {
	 return Math.sqrt(obj.x * obj.x + obj.y * obj.y);
       };
       
       obj.normalize = function() {
	 var l = obj.len();
	 if (l > 0) {
	   obj.x /= l;
	   obj.y /= l;
	 }
	 return obj;
       };
              
       return obj;
     };
     
     /*
      * RECTANGLE
      */
     
     function createRectangle(x, y, width, height){
       var obj = {};
       obj.x = x;
       obj.y = y;
       obj.width = width;
       obj.height = height;
       
       obj.center = createVector(x + width / 2, y + height /2);
       obj.centerX = x + width /2;
       obj.centerY = y + height /2;
       
       obj.outcode = function(point) {
	 var rectSlope = Math.abs(obj.height / obj.width);
	 var outSlope = Math.abs((point.y - (obj.y + obj.height /2)) / (point.x - (obj.x + obj.width /2)));
	 
	 if (rectSlope > outSlope) {
	   //located left or right
	   if (point.x < obj.x) {
             return opts.OUT_LEFT;
	   } else if (point.x > obj.x + obj.width) {
             return opts.OUT_RIGHT;
	   }
	 } else {
	   // located top or bottom
	   if (point.y < obj.y) {
             return opts.OUT_TOP;
	   } else if (point.y > obj.y + obj.height) {
             return opts.OUT_BOTTOM;
	   }
	 }
	 return 0;
	 
       };
       
       obj.getOutPointThroughCenter = function(theta) {
	 var cx = obj.centerX, cy = obj.centerY;
	 var w = obj.width / 2;
	 var h = obj.height / 2;
	 var d = Math.sqrt(w * w + h * h);
	 var x = cx + d * Math.cos(theta);
	 var y = cy + d * Math.sin(theta);
	 var out = this.outcode(createVector(x, y));
	 
	 var p = createVector(cx, cy);
	 if (out & opts.OUT_TOP) {
	   p.translate(- h * ((x - cx) / (y - cy)), -h);
	 } else if (out & opts.OUT_BOTTOM) {
	   p.translate(h * ((x - cx) / (y - cy)), h);
	 } else if (out & opts.OUT_LEFT) {
	   p.translate(-w, -w * ((y - cy) / (x - cx)));
	 } else if (out & opts.OUT_RIGHT) {
	   p.translate(w, w * ((y-cy)/(x-cx)));
	 }
	 
	 return p;  
       };
       
       return obj; 
     };
     
     function rectangleFromElement ($e, paddingTop, paddingLeft, border) {
       return createRectangle(
	 parseInt($e.css("left")),
	 parseInt($e.css("top")),
	 $e.width() + paddingLeft * 2 + border * 2,
	 $e.height() + paddingTop * 2 + border * 2);
     };
     
     /*
      * CONCEPT
      */        

     function createConcept(title, x, y) {
       var html = $("<div class='concept'>" + title + "</div>");
       var obj = {
	 title: title,
	 pos: createVector(x || 0, y || 0),
	 v: createVector(0, 0)
       };
       html.data('concept', obj);
       obj['$html'] = html;
       obj.toString = function(){
	 return this.title;
       };
       return obj;
     };

     /*
      * RELATION
      */

     function createRelation(from, to, label){
       var obj = {};
       obj.$html = $("<div class='relation'>" + label + "</div>");
       obj.from = from;
       obj.to = to;
       obj.label = label;
       obj.title = from + '_' + to + '_' + label;
       
       obj.toString = function() {
	 return from + " " + label + " " + to;
       };
       
       obj.lookupRect = function(concept) {
	 if (!caches.rectCache[concept.title]) {        
	   caches.rectCache[concept.title] = rectangleFromElement(concept.$html, 5, 10, 1);
	 }
	 
	 return caches.rectCache[concept.title];
       };
       
       obj.getEdgePoints = function () {
	 if (!caches.edgePointCache[this.title]) {
	   var rect1 = this.lookupRect(from);
	   var rect2 = this.lookupRect(to);
	   
	   var theta = Math.atan2(rect2.center.y - rect1.center.y, rect2.center.x - rect1.center.x);
	   var p1 = rect1.getOutPointThroughCenter(theta);
	   var p2 = rect2.getOutPointThroughCenter(theta + Math.PI);
	   
	   caches.edgePointCache[this.title] = {p1: p1, p2: p2, theta: theta};
	 }
    
	 return caches.edgePointCache[this.title];
       };
    
       return obj;
     };

     /*
      * LAYOUT
      */

     var springLayout = {
       coulombRepulsion: function(c1, c2) {
	 var f = createVector(c2.x - c1.x, c2.y - c1.y);
	 var lengthSquared = f.x * f.x + f.y * f.y;
	 f.scale(lengthSquared > 0 ? 1 / lengthSquared : 1);
	 f.scale(opts.COULOMB_FACTOR);
	 return f;
       },
       hookeAttraction: function(c1, c2, desiredLength) {
	 var f = createVector(c2.x - c1.x, c2.y - c1.y);
	 var len = f.len();
	 return f.normalize().scale(len - desiredLength).scale(opts.SPRING_CONSTANT);
       },
       layoutMap: function(conceptMap) {
	 var targetPos = {};    
	 var stepCount = 0;
	 var totalEnergy = 0;
	 
	 caches.clearCaches();
	 
	 var concepts = conceptMap.concepts;
	 var relations = conceptMap.relations;
	 var ckeys = conceptMap.conceptsKeys;
	 var rkeys = conceptMap.relationsKeys;
	 var clen = ckeys.length;
	 var rlen = rkeys.length;
	 var i = clen;
	 
	 while (i--){
	   var key = ckeys[i];
	   var f = createVector(0,0);
	   var c1 = concepts[key];
	   targetPos[key] = createVector(c1.pos.x, c1.pos.y);
	   
	   if (c1.$html.hasClass("ui-draggable-dragging")) {
             c1.v = createVector(0,0);
             continue;
	   }
	   
	   var j = clen;
	   while (j--) {
             var c2 = concepts[ckeys[j]];
             var coulombForce = this.coulombRepulsion(c1.pos, c2.pos);
             f.translate(coulombForce.x, coulombForce.y);
	   }
	   
	   var k = rlen;
	   while (k--){
             var relation = relations[rkeys[k]];
             if (relation.from == c1) {
               var edgePoints = relation.getEdgePoints();
	       var hookeForce = this.hookeAttraction(edgePoints.p1, edgePoints.p2, opts.SPRING_LENGTH);
               f.translate(hookeForce);
             } else if (relation.to == c1) {
               var edgePoints = relation.getEdgePoints();
               var hookeForce = this.hookeAttraction(edgePoints.p2, edgePoints.p1, opts.SPRING_LENGTH);
               f.translate(hookeForce);
             }
	   }
	   c1.v.translate(f);
	   c1.v.scale(opts.DAMPING);
	   targetPos[key].translate(c1.v.x, c1.v.y);
	 }
	 
	 var l = clen;
	 while (l--){
	   var key2 = ckeys[l];
	   var concept = concepts[key2];
	   concept.pos.x = Math.min(Math.max(targetPos[key2].x, 30), conceptMap.canvas.width - 30);
	   concept.pos.y = Math.min(Math.max(targetPos[key2].y, 30), conceptMap.canvas.height - 30);
	   totalEnergy += concept.v.len() * concept.v.len();
	 }
	 
	 return totalEnergy > 2.5 * conceptMap.conceptsLength();
       }
     };

     /*
      * CONCEPTMAP
      */
     
     var conceptMap = {
       init: function(targetID, layoutEngine){
	 this.relations = {};
	 this.concepts = {};
	 this.conceptsKeys = [];
	 this.relationsKeys = [];
	 this.$container = targetID;  // jQuery Object    
	 this.needsRedraw = true;
	 this.conceptMap = conceptMap;
	 this.layoutEngine = layoutEngine;
	 this.$container.html("<canvas id='canvas' width='800' height='600'></canvas>");
	 this.canvas = $("#canvas").get(0); 
       },
       conceptsLength: function() {
	 var size = 0, key;
	 for (key in this.concepts) {
	   if (this.concepts.hasOwnProperty(key)) size++;
	 }
	 return size-1;
       },
       relationsLength: function() {
	 var size = 0, key;
	 for (key in this.relations) {
	   if (this.relations.hasOwnProperty(key)) size++;
	 }
	 return size-1;
       },
       redraw : function() {
	 this.needsRedraw = true;
       },
       addConcept: function(title) {
	 var that = this;
	 var pos_x = Math.random() * 1024;
	 var pos_y = Math.random() * 600;
	 var concept = createConcept(title, pos_x, pos_y);  
	 this.concepts[title] = concept;
	 this.conceptsKeys.push(title);
	 var $concept = concept.$html;
	 this.$container.prepend($concept);
	 $concept.css("left", concept.pos.x + "px").css("top", concept.pos.y + "px");
	 
	 $concept.draggable({
			      drag: function(event, ui) {
				var concept = $(this).data("concept");
				concept.pos.x = ui.offset.left;
				concept.pos.y = ui.offset.top;
				that.redraw();
			      }
			    }).disableSelection();
	 
	 return this.concepts[title];
       },
       removeConcept: function (title) {
	 var concept = this.concepts[title];
	 concept.$html.remove();
	 delete this.concepts[title];
	 this.conceptsKeys.splice(this.conceptsKeys.indexOf(title),1);
       },
       addRelation: function(from, to, label) {
	 var relation = createRelation(from, to , label);
	 this.relations[relation.title] = relation;
	 this.relationsKeys.push(relation.title);
	 this.$container.append(relation.$html);    
	 return relation;
       },
       removeRelation: function(title) {
	 var relation = this.relations[title];
	 delete this.relations[title];
	 relation.$html.remove();
	 this.relationsKeys.splice(this.relationsKeys.indexOf(title),1);
       },
       getRelation: function(from, to, label) {
	 var k = from + '_' + to + '_' + label;
	 return this.relations[k];
       },
       addTriple: function(triple){
	 var concept1 = this.concepts[triple.concept1] || this.addConcept(triple.concept1);
	 var concept2 = this.concepts[triple.concept2] || this.addConcept(triple.concept2);
	 var k = triple.concept1 + '_' + triple.concept2 + '_' + triple.relation;
	 return this.relations[k] || this.addRelation(concept1, concept2, triple.relation);
       },
       loadFacts: function () {
	 this.needsRedraw = false;
//	 console.log(opts.tripleLoader);
	 var triples = opts.tripleLoader.func(this, opts.tripleLoader.args);
	 var tl = triples.length;
	 
	 for (var i=0; i<tl; i++){
	   var triple = triples[i];
	   var relation = this.addTriple(triple);
	   relation.keep = true;
	   relation.to.keep = true;
	   relation.from.keep = true;
	 }
	 	 
	 for (var c in this.concepts){
	   if (!this.concepts[c].keep) {
	     this.removeConcept(c);
	   } else {
	     this.concepts[c].keep = false;
	   }
	 };
	 for (var r in this.relations){
	   if (!this.relations[r].keep){
	     this.removeRelation(r);	
	   } else {
	     this.relations[r].keep = false;
	   }
	   
	 };
	 
	 this.redraw();
//	 console.log('conceptsLength',this.conceptsLength());
//	 console.log('relationsLength',this.relationsLength());
//	 console.log('relations',this.relations);
       },
       drawRelations: function() {
	 var ctx = this.canvas.getContext("2d");

	   ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
	 
	 ctx.lineWidth = 2;
	 ctx.fillStyle="rgb(100, 100, 100)";
	 ctx.strokeStyle="rgb(100, 100, 100)";
	 
	 for (var k in this.relations) {
	   var relation = this.relations[k];
	   ctx.beginPath();
	 
	   var edgePoints = relation.getEdgePoints();

	   ctx.moveTo(edgePoints.p1.x, edgePoints.p1.y);
	   ctx.lineTo(edgePoints.p2.x, edgePoints.p2.y);
	   ctx.stroke();

	   ctx.beginPath();

	   var x = edgePoints.p2.x + opts.ARROW_SIZE * Math.cos(edgePoints.theta+Math.PI-opts.ARROW_ANGLE);
	   var y = edgePoints.p2.y + opts.ARROW_SIZE * Math.sin(edgePoints.theta+Math.PI-opts.ARROW_ANGLE);
	   ctx.moveTo(x, y);
	   ctx.lineTo(edgePoints.p2.x, edgePoints.p2.y);
	   
	   x = edgePoints.p2.x + opts.ARROW_SIZE * Math.cos(edgePoints.theta+Math.PI + opts.ARROW_ANGLE);
	   y = edgePoints.p2.y + opts.ARROW_SIZE * Math.sin(edgePoints.theta+Math.PI + opts.ARROW_ANGLE);
	   ctx.lineTo(x, y);
	   
	   ctx.fill();
	   
	   var labelLeft = (edgePoints.p1.x + edgePoints.p2.x - relation.$html.width()) / 2;
	   var labelTop = (edgePoints.p1.y + edgePoints.p2.y - relation.$html.height()) / 2;
	   
	   relation.$html.attr("style", "left: " + labelLeft + "px; top: " + labelTop + "px");
	 }
       },
       drawMap: function() {
	 if (this.needsRedraw){
	   this.needsRedraw = this.layoutEngine.layoutMap(this);
	   
	   for (c in this.concepts){
	     var concept = this.concepts[c];
	     concept.$html.attr("style", "left: " + concept.pos.x + "px; top:" + concept.pos.y + "px");
	   }
	   this.drawRelations();
	 }
       }
     };


     
     conceptMap.init(this, springLayout);
     conceptMap.loadFacts();
     setInterval(function(){ conceptMap.drawMap(); }, 20);    
     
   };

   
   $.fn.conceptMap.defaults = {
     OUT_LEFT: 1,
     OUT_RIGHT: 2,
     OUT_TOP: 4,
     OUT_BOTTOM: 8,
     ARROW_SIZE: 10,
     ARROW_ANGLE: Math.PI / 6,
     DAMPING: 0.7,
     COULOMB_FACTOR: -100,
     SPRING_CONSTANT: 0.05,
     SPRING_LENGTH: 100
   };
})( jQuery );