function parseFact(fact){
  fact = fact.trim();
  var topic1, topic2, relation;
  if (/^[^"]+"[^"]+"[^"]+$/.test(fact)) {
    var firstQuote = fact.indexOf('"');
    var secondQuote = fact.indexOf('"', firstQuote + 1);
    
    topic1 = fact.substr(0, firstQuote).trim();
    topic2 = fact.substr(secondQuote + 1).trim();
    relation = fact.substr(firstQuote + 1, secondQuote - firstQuote - 1).trim();
    
    return {concept1: topic1, relation: relation, concept2: topic2};
    
  } else if (/^([A-Z][a-z]* )+([a-z]+ )+[A-Z][a-z]*( [A-Z][a-z]*)*$/.test(fact)) {
    
    var words = fact.split(/( [a-z]+)+/g);
    var firstLowerCaseWord = fact.indexOf(/ [a-z]/);
    var firstUpperAfterRelation = fact.indexOf(/ [A-z]/, firstLowerCaseWord + 1);
    
    topic1 = words[0].trim();
    topic2 = words[words.length-1].trim();
    relation = fact.substr(topic1.length, fact.length-topic1.length-topic2.length).trim();
    
    return {concept1: topic1, relation: relation, concept2: topic2};
  }
  
  return null;
};

function textareaLoadEngine(conceptMap){
	 
  
  var $facts = $("#concepts");
  $facts.change(function(e){
		  conceptMap.loadFacts(this.value);
		  console.log('facts changed');
		});
  var text = $facts.val();
  var facts = text.split('\n');
  var triples = [];
  var fl = facts.length;
  for (var i=0; i < fl; i++){
    var t = parseFact(facts[i]) ;
    if (t){
      triples.push(t);
    }
  }
  return triples;
};
      