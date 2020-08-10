/* 
 * This file is part of OverPy (https://github.com/Zezombye/overpy).
 * Copyright (c) 2019 Zezombye.
 * 
 * This program is free software: you can redistribute it and/or modify  
 * it under the terms of the GNU General Public License as published by  
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of 
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License 
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var obfuscationMappings = {};
for (var char of ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~') {
	obfuscationMappings[char] = String.fromCodePoint(char.charCodeAt(0)+0xE0000);
}

var obfuscatedVarNames = shuffleArray(Array(4096).fill().map((e,i)=>i).map(x => x.toString(2).padStart(12, "0").replace(/0/g, "I").replace(/1/g, "l"))).slice(0,128);

function addObfuscationRules(rules) {
	if (!compiledCustomGameSettings) {
		error("Cannot use obfuscation without custom game settings declared");
	}
	var nbEmptyRules = (obfuscationSettings.ruleFilling ? 2500 : 0);
	var nbTotalRules = nbEmptyRules + rules.length + 2 /*copy detection rules*/;
	var emptyRule = tows("__rule__", ruleKw)+'(""){'+tows("__event__", ruleKw)+"{"+tows("global", eventKw)+";}}\n";

	var copyDetectionRule1 = `
${tows("__rule__", ruleKw)}("") {
	${tows("__event__", ruleKw)} {
		${tows("global", eventKw)};
	}
	${tows("__actions__", ruleKw)} {
		${tows("__abortIf__", actionKw)}(0.0000001);
		${tows("__hudText__", actionKw)}(${tows("getPlayers", valueFuncKw)}(${tows("ALL", constantValues.TeamLiteral)}), ${tows("__customString__", valueFuncKw)}(" \\n\\n\\n\\n\\n\\n\\n\\nIt seems you have tampered with the gamemode!\nPlease consult with the creator before doing any unwanted m{0}", ${tows("__customString__", valueFuncKw)}("odifications.\\n\\nThe server will now crash.\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n")), ${tows("null", valueFuncKw)}, ${tows("null", valueFuncKw)}, ${tows("TOP", constantValues.HudPosition)}, -99999999, ${tows("RED", constantValues.Color)}, ${tows("RED", constantValues.Color)}, ${tows("RED", constantValues.Color)}, ${tows("VISIBILITY_AND_STRING", constantValues.HudReeval)}, ${tows("ALWAYS", constantValues.SpecVisibility)});
	}
}
	`

	var copyDetectionRule2 = `
${tows("__rule__", ruleKw)}("") {
	${tows("__event__", ruleKw)} {
		${tows("global", eventKw)};
	}
	${tows("__conditions__", ruleKw)} {
		0.00000001 == ${tows("false", valueFuncKw)};
	}
	${tows("__actions__", ruleKw)} {
		${tows("__wait__", actionKw)}(${tows("random.uniform", valueFuncKw)}(30, 60), ${tows("IGNORE_CONDITION", constantValues.Wait)});
		${tows("__while__", actionKw)}(${tows("true", valueFuncKw)});
		${tows("__end__", actionKw)};
	}
}
	`

	var result = "";
	result += `
${tows("__rule__", ruleKw)}("This program has been obfuscated by OverPy (github.com/Zezombye/OverPy). Please respect its author's wishes and do not edit it. Thanks!") {
	${tows("__event__", ruleKw)} {
		${tows("global", eventKw)};
	}
	${tows("__actions__", ruleKw)} {
		${obfuscationSettings.obfuscateInspector ? tows("disableInspector", actionKw)+";" : ""}
		${obfuscationSettings.obfuscateConstants ? astActionToWs(obfuscationConstantsAst, 0) : ""}
	}
}
`;
	var putEmptyRuleArray = shuffleArray([3,2].concat(Array(nbEmptyRules).fill(1)).concat(Array(rules.length).fill(0)));
	var ruleIndex = 0;
	for (var i = 0; i < nbTotalRules; i++) {
		if (putEmptyRuleArray[i] === 1) {
			result += emptyRule;
		} else if (putEmptyRuleArray[i] === 3) {
			result += copyDetectionRule1;
		} else if (putEmptyRuleArray[i] === 2) {
			result += copyDetectionRule2;
		} else {
			result += rules[ruleIndex];
			ruleIndex++;
		}
	}
	return result;

}

//Gather all constants to obfuscate and shuffle them
var constantsToObfuscate = [];
for (var constantType of ["HeroLiteral", "MapLiteral", "GamemodeLiteral", "ButtonLiteral"]) {
	constantsToObfuscate = constantsToObfuscate.concat(Object.keys(constantValues[constantType]).map(x => constantType+x));
}
constantsToObfuscate = shuffleArray(constantsToObfuscate);
//console.log(constantsToObfuscate);

//Create the asts and map them to the index
var constantsToObfuscateAsts = Array(constantsToObfuscate.length);
var obfuscationConstantsMapping = {}

var typeToAstFuncMapping = {
	"HeroLiteral": "__hero__",
	"MapLiteral": "__map__",
	"GamemodeLiteral": "__gamemode__",
	"ButtonLiteral": "__button__",
}
for (var constantType of ["HeroLiteral", "MapLiteral", "GamemodeLiteral", "ButtonLiteral"]) {
	obfuscationConstantsMapping[constantType] = {};

	for (var constant of Object.keys(constantValues[constantType])) {
		var constantIndex = constantsToObfuscate.indexOf(constantType+constant);
		obfuscationConstantsMapping[constantType][constant] = constantIndex * 0.0000001/*+(constantIndex > 0 ? (Math.random()*0.8)-0.4 : 0)*/;
		constantsToObfuscateAsts[constantIndex] = new Ast(typeToAstFuncMapping[constantType], [new Ast(constant, [], [], constantType)]);
	}
}

//console.log(constantsToObfuscateAsts);
var obfuscationConstantsAst = new Ast("__assignTo__", [
	new Ast("__globalVar__", [new Ast("__obfuscationConstants__", [], [], "GlobalVariable")]),
	new Ast("__array__", constantsToObfuscateAsts),
]);