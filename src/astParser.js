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

"use strict";

function parseAstRules(rules) {
    for (var rule of rules) {

        fileStack = rule.fileStack;

        //Parse annotations
        var i = 0;
        for (; i < rule.children.length; i++) {

            if (!rule.children[i].name.startsWith("@")) {
                break;
            }
            fileStack = rule.children[i].fileStack;

            if (["@Name", "@Event", "@Team", "@Slot", "@Hero"].includes(rule.children[i].name)) {
                const annotationToPropMap = {
                    "@Name": {prop: "name", display: "name"},
                    "@Event": {prop: "event", display: "event"},
                    "@Team": {prop: "eventTeam", display: "event team"},
                    "@Slot": {prop: "eventPlayer", display: "event player (@Hero/@Slot)"},
                    "@Hero": {prop: "eventPlayer", display: "event player (@Hero/@Slot)"},
                };

                if (rule.children[i].args.length !== 1) {
                    error("Annotation '"+rule.children[i].name+"' takes 1 argument, received "+rule.children[i].args.length);
                }
                if (annotationToPropMap[rule.children[i].name].prop in rule.ruleAttributes) {
                    error("Rule "+annotationToPropMap[rule.children[i].name].display+" was already declared");
                }

                if (rule.children[i].name === "@Name") {
                    if (rule.children[i].args[0].type !== "StringLiteral") {
                        error("Expected a string as argument of '@Name'");
                    }
                    rule.ruleAttributes[annotationToPropMap[rule.children[i].name].prop] = rule.children[i].args[0].name;
                } else {
                    rule.ruleAttributes[annotationToPropMap[rule.children[i].name].prop] = rule.children[i].args[0].name;
                }
                
            } else if (rule.children[i].name === "@SuppressWarnings") {

                if (rule.children[i].args.length < 1) {
                    error("Annotation '"+rule.children[i].name+"' takes at least 1 argument, received "+rule.children[i].args.length);
                }
                for (var arg of rule.children[i].args) {
                    suppressedWarnings.push(arg.name);
                }

            } else if (rule.children[i].name === "@Disabled") {
                rule.ruleAttributes.isDisabled = true;

            } else if (rule.children[i].name === "@Condition") {
                if (!("conditions" in rule.ruleAttributes)) {
                    rule.ruleAttributes.conditions = [];
                }
                rule.ruleAttributes.conditions.push(rule.children[i].args[0]);
                rule.ruleAttributes.conditions[rule.ruleAttributes.conditions.length-1].comment = rule.children[i].comment;

            } else {
                error("Unknown annotation '"+rule.children[i].name+"'");
            }
        }
        //Remove the annotations from the children
        rule.children = rule.children.slice(i);
        fileStack = rule.fileStack;
        

        if (rule.name === "__rule__") {

            if (rule.ruleAttributes.event === undefined) {
                rule.ruleAttributes.event = "global";
            }
            if (rule.ruleAttributes.event === "global") {
                if (rule.ruleAttributes.eventTeam !== undefined || rule.ruleAttributes.eventPlayer !== undefined) {
                    error("Cannot declare event team or event player with event type '"+rule.ruleAttributes.event+"'");
                }
            } else {
                if (rule.ruleAttributes.eventTeam === undefined) {
                    rule.ruleAttributes.eventTeam = "all";
                }
                if (rule.ruleAttributes.eventPlayer === undefined) {
                    rule.ruleAttributes.eventPlayer = "all";
                }
            }
            
        } else if (rule.name === "__def__") {
            if (rule.ruleAttributes.event !== undefined) {
                error("Cannot declare event for a subroutine");
            }
            if (rule.ruleAttributes.conditions !== undefined) {
                error("Cannot declare rule conditions for a subroutine");
            }
            rule.ruleAttributes.event = "__subroutine__";
            if (rule.ruleAttributes.eventTeam !== undefined || rule.ruleAttributes.eventPlayer !== undefined) {
                error("Cannot declare event team or event player for a subroutine");
            }
            if (rule.ruleAttributes.name === undefined) {
                rule.ruleAttributes.name = "Subroutine "+rule.ruleAttributes.subroutineName;
            }
            rule.name = "__rule__";
            rule.originalName = "__def__";
        } else {
            error("Unexpected function '"+rule.name+"' outside a rule");
        }
        
        currentRuleEvent = rule.ruleAttributes.event;
        currentRuleLabels = [];
        currentRuleLabelAccess = {};
        currentRuleHasVariableGoto = false;
        
        rule = parseAst(rule);
    }
    return rules;
}

function parseAst(content) {

    if (!(typeof content === "object")) {
        error("Content is not object: "+content);
    }
    //console.log(currentRuleLabels);

    fileStack = content.fileStack;
    debug("Parsing AST of '"+content.name+"'");

    if (!(content.args instanceof Array)) {
        error("Function '"+content.name+"' has '"+content.args+"' for args, expected array");
    }
    if (!(content.children instanceof Array)) {
        error("Function '"+content.name+"' has '"+content.children+"' for args, expected array");
    }
    if (content.name.startsWith("@")) {
        //Annotations are processed in the parseAstRules function. If we encounter an annotation here, then it wasn't at the beginning of a rule.
        error("Annotations must be at the beginning of the rule");
    }

    for (var i = 0; i < content.args.length; i++) {
        content.argIndex = i;
        content.args[i] = parseAst(content.args[i]);
    }
    content.argIndex = 0;


    //Skip if it's a literal or a constant
    if ([
        "NumberLiteral", 
        "GlobalVariable", "PlayerVariable", "Subroutine", 
        "HeroLiteral", "MapLiteral", "GamemodeLiteral", "TeamLiteral",
    ].concat(Object.keys(constantValues)).includes(content.type)) {
        return content;
    }

    //For labels, just check if they are already declared.
    if (content.type === "Label") {
        if (content.parent.name !== "__distanceTo__") {
            if (currentRuleLabels.includes(content.name)) {
                error("Label '"+content.name+"' is already declared in this rule");
            }
            currentRuleLabels.push(content.name);
        }
        return content;
    }

    //For string literals, check if they are a child of __format__ (or of a string function). If not, wrap them with the __format__ function.
    if (["StringLiteral", "LocalizedStringLiteral", "FullwidthStringLiteral", "BigLettersStringLiteral"].includes(content.type)) {
        if (["__format__", "__customString__", "__localizedString__"].includes(content.parent.name) && content.parent.argIndex === 0) {
            return content;
        } else {
            content = new Ast("__format__", [content]);
        }
    }

    //Manually check types and arguments for the __format__ or __array__ function, as they are the only functions that can take an infinite number of arguments.
    if (content.name === "__format__") {
        if (content.args.length < 1) {
            error("Function '__format__' takes at least 1 argument, received "+content.args.length);
        }
        //Check types
        if (!isTypeSuitable(funcKw[content.name].args[0].type, content.args[0].type)) {
            warn("w_type_check", getTypeCheckFailedMessage(content, 0, funcKw[content.name].args[0].type, content.args[0]));
        }
        for (var i = 1; i < content.args.length; i++) {
            if (!isTypeSuitable(funcKw[content.name].args[1].type, content.args[i].type)) {
                warn("w_type_check", getTypeCheckFailedMessage(content, i, funcKw[content.name].args[1].type, content.args[i]));
            }
        }

    } else if (content.name === "__array__" || content.name === "__dict__") {
        //Check types
        for (var i = 0; i < content.args.length; i++) {
            if (!isTypeSuitable(funcKw[content.name].args[0].type, content.args[i].type)) {
                warn("w_type_check", getTypeCheckFailedMessage(content, i, funcKw[content.name].args[0].type, content.args[i]));
            }
        }

    } else if (content.name in funcKw) {

        if (content.name === "__for__") {

            if (content.args.length !== 1) {
                error("Function '"+content.name+"' takes 1 argument, received "+content.args.length);
            }

            //Check for right arguments.
            if (content.args[0].name !== "__arrayContains__") {
                error("Expected the 'in' operator within 'for' directive, but got "+functionNameToString(content.args[0]));
            }
            if (content.args[0].args[0].name !== "range") {
                error("Expected the 'range' function for the 2nd operand of the 'in' operator, but got "+functionNameToString(content.args[0].args[1]));
            }

            //for (i in range(1,2,3)) -> for(i, 1, 2, 3)
            content.args = [
                content.args[0].args[1],
                content.args[0].args[0].args[0],
                content.args[0].args[0].args[1],
                content.args[0].args[0].args[2],
            ];

        } else if (["hudHeader", "hudSubheader", "hudSubtext"].includes(content.name)) {
      
            if (content.args.length < 6 || content.args.length > 7) {
                error("Function '"+content.name+"' takes 6 or 7 arguments, received "+content.args.length);
            }
            if (content.args.length === 6) {
                content.args.push(new Ast("DEFAULT", [], [], "SpecVisibility"));
            }

        } else if (content.name === "hudText") {
            if (content.args.length < 10 || content.args.length > 11) {
                error("Function '"+content.name+"' takes 10 or 11 arguments, received "+content.args.length);
            }
            if (content.args.length === 10) {
                content.args.push(new Ast("DEFAULT", [], [], "SpecVisibility"));
            }

        } else if (content.name === "range") {
            if (content.args.length < 1 || content.args.length > 3) {
                error("Function '"+content.name+"' takes 1 to 3 arguments, received "+content.args.length);
            }
            if (content.args.length === 1) {
                content.args.unshift(getAstFor0());
            }
            if (content.args.length === 2) {
                content.args.push(getAstFor1());
            }

        } else if (content.name === "wait") {
            if (content.args.length > 2) {
                error("Function 'wait' takes 0 to 2 arguments, received "+args.length);
            }
            if (content.args.length === 0) {
                content.args.push(getAstFor0_016());
            }
            if (content.args.length === 1) {
                content.args.push(new Ast("IGNORE_CONDITION", [], [], "Wait"));
            }
            content.name = "__wait__";
        }
        
        var nbExpectedArgs = (funcKw[content.name].args === null ? 0 : funcKw[content.name].args.length);
        if (content.args.length !== nbExpectedArgs) {
            error("Function '"+content.name+"' takes "+nbExpectedArgs+" arguments, received "+content.args.length);
        }

        //Type check
        for (var i = 0; i < content.args.length; i++) {
            if (!isTypeSuitable(funcKw[content.name].args[i].type, content.args[i].type)) {
                warn("w_type_check", getTypeCheckFailedMessage(content, i, funcKw[content.name].args[i].type, content.args[i]));
            }
        }

    } else {
        error("Unknown function '"+content.name+"'");
    }


    if (content.name in astParsingFunctions) {
        content = astParsingFunctions[content.name](content);
    }

    for (var i = 0; i < content.children.length; i++) {
        content.childIndex = i;
        console.log("name = "+content.name+", childIndex = "+content.childIndex+", children = "+content.children.map(x => x.name).join(", "))
        console.log("parsing "+content.children[i].name);
        
        content.children[i].parent = content;
        content.children[i] = parseAst(content.children[i]);
        content.children[i].parent = content;
    }
    content.childIndex = 0;

    return content;
}