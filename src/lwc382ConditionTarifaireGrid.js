import { LightningElement, track, api, wire } from 'lwc';

import getInfolineRef from '@salesforce/apex/LWC382_ConditionTarifaire.getInfolineRef';
import getInfolineNeg from '@salesforce/apex/LWC382_ConditionTarifaire.getInfolineNeg';
import enregistrerInfo from '@salesforce/apex/LWC382_ConditionTarifaire.enregistrer';

import templateRemiseGlob from './lwc382ConditionTarifaireGrid.html';
import templateModif from './lwc382ConditionTarifaireGridModification.html';

function updateCellValue(cell, percent, remiseType, remiseInitiale) {
    if (!isNaN(percent) && percent != '') {
        switch (remiseType) {
            case 'remGlobal':
                let previousRemiseGlobal = cell.remiseGlobal;
                if (!remiseInitiale || remiseInitiale == '') remiseInitiale = 0;
                if (previousRemiseGlobal)
                    cell.value = cell.value / (1 - previousRemiseGlobal / 100);
                else cell.value = cell.value / (1 - remiseInitiale / 100);
                cell.remiseGlobal = percent;
                break;
            case 'remCol':
                let previousRemiseCol = cell.remiseCol;
                if (previousRemiseCol)
                    cell.value = cell.value / (1 - previousRemiseCol / 100);
                cell.remiseCol = percent;
                break;
            case 'remLine':
                let previousRemiseLine = cell.remiseLine;
                if (previousRemiseLine)
                    cell.value = cell.value / (1 - previousRemiseLine / 100);
                cell.remiseLine = percent;
                break;
        }
        percent = 1 - percent / 100;
        cell.value = (cell.value * percent).toFixed(2);
    }
}

export default class Lwc382ConditionTarifaireGrid extends LightningElement {
    @api detId;
    @api oppId;
    @api generalInfo;

    @track listTarifs;
    @track tarifValue;
    //    @api detId = 'a0k4E000006rUie';
    @track redirect;
    @track loaded;
    @track labels;
    @track values;
    @track tableWidth;
    @track tableClass;
    @track modificationMode;
    @track affEnregistrer;
    @track remise = '';
    //on stocke la remise qui a été saisie au préalable par l'utilisateur (si il y'en avait une)
    @track remiseInitiale;
    // remise que l'on doit envoyer lors de l'enregistrement.peut etre différente de la remise affichée
    @track remiseEnr;
    // % de Remise modélisé lors de la cotation qui sera réaffiché en retour aux conditions de référence
    @track remiseRefModelisee;
    // ce paramètre surcharge le comportement de modificationMode et garantie que le composant était

    @api readOnly;
    @api typeGrid;
    @track gridTitle;
    @track gridModifiable;

    @track showDetail = false;

    @track nbRows;
    @track nbCols;
    @track modalImportEnable;
    @track erreur;

    afficherTableau(data) {
        let tbValues = JSON.parse(JSON.stringify(data));
        this.labels = tbValues[0];
        // on récupère les liste des valeurs en enlevant la ligne des labels
        this.values = tbValues.slice(1);
        this.lastEventValue = '';
        this.tableWidth =
            'width:' + (180 + 50 * this.labels.infos.length) + 'px';
        this.tableClass = 'slds-m-top-medium slds-m-left_xx-large remiseTable';
        if (this.labels.editable) {
            this.tableClass = 'slds-m-top-medium slds-m-left-small remiseTable';
        }
        this.modificationMode = false;
        this.nbRows = this.values.length;
        this.nbCols = this.values[0].infos.length;
    }

    // initialisation des données
    connectedCallback() {
        this.modificationMode = false;
        this.remise = this.generalInfo.remiseInitiale;
        this.remiseInitiale = this.generalInfo.remiseInitiale;
        this.remiseEnr = this.generalInfo.remiseInitiale;
        this.remiseRefModelisee = this.generalInfo.remiseRefModelisee;
        this.redirect = '/' + this.oppId;
        this.loaded = false;

        this.showDetail = false;
        if (this.typeGrid == 'contract'){
            this.gridTitle = 'Tarifs contractualisés';
            this.showDetail = true;
            this.gridModifiable = false;
        } else if (this.typeGrid == 'detail') {
           this.gridTitle = 'Proposition tarifaire détaillée';
            this.gridModifiable = false;
        } else {
            if(this.generalInfo.isOpenPricer) {
                console.log('REP récupération de IsOpenPricer : ' + this.generalInfo.isOpenPricer);
                this.gridTitle = 'Proposition tarifaire modélisée';
            }else{
                this.gridTitle = 'Proposition tarifaire';
            }
            this.showDetail = true;
            this.gridModifiable = true;
        }

        getInfolineNeg({ sfaDetailId: this.detId, typeGrid: this.typeGrid })
            .then((result) => {
                this.afficherTableau(result);
                if (this.labels.tDiscount) {
                    this.remise = this.labels.tDiscount;
                    this.remiseInitiale = this.labels.tDiscount;
                    this.remiseEnr = this.labels.tDiscount;
                }
                if (this.generalInfo.isCustomGrid && !this.readOnly) {
                    this.modifier(null);
                }
                // on informe le parent si il n'y a pas de valeurs
                const rainboGridEvent = new CustomEvent('affRainbowGrid', {
                    detail: true
                });
                this.dispatchEvent(rainboGridEvent);

                this.loaded = true;
            })
            .catch((error) => {
                this.displayModal(
                    'Error in getInfolineNeg',
                    JSON.stringify(error)
                );
                this.loaded = true;
            });

        if (this.remise == null) this.remise = '';

        this.affEnregistrer = false;
    }

    updateLineValue() {
        this.values.forEach((line) => {
            var percentRowTr = this.template.querySelector(
                'tr[data-id="' + line.idLine + '"]'
            );
            var cellPercentTd = percentRowTr.querySelector(
                '[data-id="' + line.idLine + '"]'
            );
            line.infos.forEach((cellValue) => {
                updateCellValue(
                    cellValue,
                    cellPercentTd.value,
                    'remLine',
                    null
                );
            });
        });
    }

    updateColValue() {
        this.labels.infos.forEach((colInfo) => {
            var percentRowTr = this.template.querySelector(
                'tr[data-id="colPercent"]'
            );
            this.values.forEach((value) => {
                var cellPercentTd = percentRowTr.querySelector(
                    '[data-id="' + colInfo.colName + '"]'
                );
                var valueToUpdate = value.infos.find(
                    (info) => info.colName === colInfo.colName
                );
                updateCellValue(
                    valueToUpdate,
                    cellPercentTd.value,
                    'remCol',
                    null
                );
            });
        });
    }

    appliquerRemise(event) {
        this.remiseEnr = null;
        this.retrieveInputValues();
        this.updateLineValue();
        this.updateColValue();
    }

    // method that push the view data to the controller
    retrieveInputValues() {
        this.values.forEach((value) => {
            var rowTr = this.template.querySelector(
                'tr[data-id="' + value.idLine + '"]'
            );
            value.infos.forEach((info) => {
                var inputElementTd = rowTr.querySelector(
                    '[data-id="' + info.colName + '"]'
                );
                info.value = parseFloat(inputElementTd.value);
            });
        });
    }

    modifier(event) {
        this.modificationMode = true;
        this.labels.editable = true;
        this.values.forEach((value) => {
            value.editable = true;
        });
        this.tableWidth =
            'width:' + (180 + 60 * this.labels.infos.length) + 'px';
        this.tableClass = 'slds-m-top_x-large slds-m-left-large remiseTable';

        const modifierEvent = new CustomEvent('modifier', {
            detail: false
        });
        this.dispatchEvent(modifierEvent);
    }



    enregistrer(event) {
        // ajout d'une popup de confirmation pour remplacer les tarifs contractuels
        //if (this.generalInfo.iSolutionRenegociee==true ){
        //    this.template.querySelector('[data-id="ModalConfirmerModif"]').show();
            //this.displayModal(
                //'Êtes-vous sûr de vouloir modifier les tarifs contractuels ?'  );
        //    this.loaded = true;            
        //}
        //else{
            this.loaded = false
            if (
                this.template.querySelector('input[data-id="remiseGlobal"]') == null
            ) {
                this.remiseEnr = null;
            }

            let values = [];
            this.template
                .querySelectorAll('input[data-idligneneg]')
                .forEach((cell) => {
                    let aCell = new Object();
                    aCell.value = cell.value.replace(',', '.');
                    aCell.idLigneNeg = cell.dataset.idligneneg;
                    aCell.colName = cell.dataset.id;
                    aCell.keySup = cell.dataset.keysup;
                    aCell.storingField = cell.dataset.storingfield;
                    values.push(aCell);
                });

        enregistrerInfo({
            listCellValues: values,
            sfaDetailId: this.detId,
            oppId: this.oppId,
            remise: this.remiseEnr
        })
            .then((result) => {
                /*
                this.modificationMode = false;
                this.labels.editable = false;
                this.lastEventValue = '';
                this.tableWidth =
                    'width:' + (180 + 60 * this.labels.infos.length) + 'px';
                this.tableClass =
                    'slds-m-top_x-large slds-m-left-large remiseTable';
                this.loaded = true;
                */
                window.open(this.redirect, '_self');
            })
            .catch((error) => {
                this.displayModal(
                    'Error in enregistrerInfo',
                    JSON.stringify(error)
                );
                this.loaded = true;
            });
        //}
    }

    appliqueRemiseGlobal(event) {
        this.appliqueRemiseGlobalInternal(null, true);
    }

    appliqueRemiseGlobalInternal(remise, fromTemplate) {
        if (fromTemplate) {
            this.remise = this.template.querySelector(
                'input[data-id="remiseGlobal"]'
            ).value;
        } else {
            this.remise = remise;
        }
        this.remiseEnr = this.remise;
        this.labels.infos.forEach((colInfo) => {
            this.values.forEach((value) => {
                var valueToUpdate = value.infos.find(
                    (info) => info.colName === colInfo.colName
                );
                updateCellValue(
                    valueToUpdate,
                    this.remise,
                    'remGlobal',
                    this.remiseInitiale
                );
            });
        });
        this.affEnregistrer = true;
    }

    appliquerConditionsReference(event) {
        getInfolineRef({ sfaDetailId: this.detId })
            .then((result) => {
                this.afficherTableau(result);
                // on traite le cas spécifique des avenant dans ce cas
                if (this.labels.tDiscount) {
                    this.remise = this.labels.tDiscount;
                    this.remiseInitiale = this.labels.tDiscount;
                    this.remiseEnr = this.labels.tDiscount;
                } else {
                    this.remise = this.remiseRefModelisee;
                    this.remiseEnr = this.remiseRefModelisee;
                    this.remiseInitiale = '';
                    this.affEnregistrer = true;
                    this.appliqueRemiseGlobalInternal(this.remise, false);
                }
            })
            .catch((error) => {
                this.displayModal('Error', JSON.stringify(error));
            });

        const modifierEvent = new CustomEvent('modifier', {
            detail: true
        });
        this.dispatchEvent(modifierEvent);
    }

    /* Gestion de la popup d'information en cas d'erreur ou de réussite */
    @track modalHeader = '';
    @track modalContent = '';
    displayModal(type, msg) {
        this.modalHeader = type;
        this.modalContent = msg;
        const modal = this.template.querySelector('c-modal');
        modal.show();
    }
    closeModal() {
        const modal = this.template.querySelector('c-modal');
        modal.hide();
    }
    /* Fin gestion de la popup d'information en cas d'erreur ou de réussite */

    render() {
        if (this.readOnly) return templateRemiseGlob;
        return this.modificationMode ? templateModif : templateRemiseGlob;
    }

    dispDetail() {
        this.showDetail = !this.showDetail;
    }

    /*  BLOC gerant la modal import   */

    displayImportModal(type, msg) {
        this.template.querySelector('[data-id="modalImport"]').show();
    }

    processImport(arrayOfValues) {
        let rowCounter = 0;
        this.values.forEach((value) => {
            let cellCounter = 0;
            value.infos.forEach((info) => {
                info.value = arrayOfValues[rowCounter][cellCounter];
                cellCounter++;
            });
            rowCounter++;
        });
    }

    handleDialogClose() {
        this.template.querySelector('[data-id="importArea"]').value = '';
        this.erreur = null;
        this.template.querySelector('[data-id="modalImport"]').hide();
    }

    valuesToImport = [];
    handleDialogImport() {
        let values = this.template.querySelector('[data-id="importArea"]')
            .value;
        this.erreur = null;

        try {
            if (values) {
                this.valuesToImport = [];
                let rows = values.split('\n');
                // si la dernière ligne est vide, on la supprime
                if (rows[rows.length - 1].length == 0) {
                    rows = rows.slice(0, rows.length - 1);
                }
                if (rows.length == this.nbRows) {
                    rows.forEach((row) => {
                        let cols = row.split('\t');
                        if (cols.length == this.nbCols) {
                            this.valuesToImport.push(cols);
                        } else {
                            this.erreur =
                                'votre tableau contient ' +
                                cols.length +
                                " colonnes alors qu'il doit en contenir " +
                                this.nbCols;
                        }
                    });
                } else {
                    this.erreur =
                        'votre tableau contient ' +
                        rows.length +
                        " lignes alors qu'il doit en contenir " +
                        this.nbRows;
                }
            }
            if (!this.erreur) {
                this.processImport(this.valuesToImport);
                this.template.querySelector('[data-id="modalImport"]').hide();
                this.template.querySelector('[data-id="importArea"]').value =
                    '';
            } else {
                console.log('erreur >> ' + this.erreur);
            }
        } catch (error) {
            console.log(error);
        }
    }

    /*  fin BLOC gerant la modal import   */

    // Gestion de la Pop up de confirmation de modif des tarifs contractuels
    // ajout d'une popup de confirmation pour remplacer les tarifs contractuels la 1ere fois
    ConfirmerEnregistrer(event) {
        if (this.generalInfo.iSolutionRenegociee==true ){
            this.template.querySelector('[data-id="ModalConfirmerModif"]').show();           
            
        }
        else{
            console.log('REP On enregistre sans popup de confirmation');            
            this.enregistrer();
        }
    }    
    // Si l'utilisateur choisi d'annuler
    handleDialogCloseModif() {
        this.template.querySelector('[data-id="ModalConfirmerModif"]').hide();
    }
    // si l'utilisateur choisi de modifier les tarifs contractuels
    handleEnregistrerModif() {
        console.log('REP On veut modifier les tarifs du contrat !!!');
        this.template.querySelector('[data-id="ModalConfirmerModif"]').hide();
        this.enregistrer();
    }
    // Fin Gestion de la Pop up de confirmation de modif des tarifs contractuels

    renderedCallback() {
        console.log('renderedCallback>>' + this.erreur);
    }
}